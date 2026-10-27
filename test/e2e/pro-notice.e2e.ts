import { browser, expect } from '@wdio/globals';
import { pluginId } from './load';

// A free user can select Save project headings and Save report template in the settings tab. The click shows the
// shared Pro notice with the "Sponsor on GitHub" button and saves nothing. A Pro user (simulated GitHub Sponsors
// answer) saves the headings, as before.
const LEADS = { headings: 'Project headings need Pro.', templates: 'Named report templates need Pro.' };

interface P {
	settings: { headings: string; templates: unknown[] };
	loadData(): Promise<unknown>;
	pro: { opts: { http: unknown }; refreshNow(): Promise<unknown>; signOut(): void; isPro(): boolean };
}

async function setPro(on: boolean): Promise<boolean> {
	return browser.executeObsidian(async ({ app }, id, on) => {
		const p = (app as unknown as { plugins: { plugins: Record<string, P> } }).plugins.plugins[id]!;
		if (!on) { p.pro.signOut(); return p.pro.isPro(); }
		p.pro.opts.http = () => Promise.resolve({ status: 200, json: { data: { viewer: { login: 'demo-reader' }, user: { sponsorshipForViewerAsSponsor: { isActive: true, isOneTimePayment: false, tier: { name: '$5 a month', monthlyPriceInCents: 500 } } } } } });
		app.secretStorage.setSecret(`${id}-github-token`, 'gho_' + '0'.repeat(36));
		await p.pro.refreshNow();
		return p.pro.isPro();
	}, pluginId, on);
}

async function openTab(): Promise<void> {
	await browser.executeObsidian(({ app }, id) => {
		const setting = (app as unknown as { setting: { open(): void; openTabById(id: string): void } }).setting;
		setting.open(); setting.openTabById(id);
		activeWindow.document.querySelectorAll('.notice').forEach((n) => n.remove());
	}, pluginId);
	await browser.waitUntil(async () => browser.execute(() => [...activeWindow.document.querySelectorAll('button')].some((b) => b.textContent === 'Save project headings')), { timeout: 5000, timeoutMsg: 'The settings tab shows no Save project headings button.' });
}

async function click(text: string): Promise<void> {
	await browser.execute((text) => { [...activeWindow.document.querySelectorAll('button')].find((b) => b.textContent === text)!.click(); }, text);
}

async function state(): Promise<{ notices: { text: string; buttons: number }[]; saved: string; settings: string; areaDisabled: boolean }> {
	return browser.executeObsidian(async ({ app }, id) => {
		const p = (app as unknown as { plugins: { plugins: Record<string, P> } }).plugins.plugins[id]!;
		const doc = activeWindow.document;
		return {
			notices: [...doc.querySelectorAll('.notice')].map((n) => ({ text: n.textContent ?? '', buttons: n.querySelectorAll('.pf-pro-notice-sponsor').length })),
			saved: JSON.stringify(await p.loadData()),
			settings: JSON.stringify(p.settings),
			areaDisabled: !!doc.querySelector<HTMLTextAreaElement>('.vertical-tab-content textarea')?.disabled,
		};
	}, pluginId);
}

describe(`${pluginId} Pro save buttons`, function () {
	afterEach(async () => {
		await browser.executeObsidian(({ app }) => { (app as unknown as { setting: { close(): void } }).setting.close(); activeWindow.document.querySelectorAll('.notice').forEach((n) => n.remove()); });
		await setPro(false);
	});

	it('a free user who selects Save project headings or Save report template gets a Pro notice with a Sponsor button, and nothing is saved', async () => {
		expect(await setPro(false)).toBe(false);
		await openTab();
		const before = await state();
		for (const [button, lead] of [['Save project headings', LEADS.headings], ['Save report template', LEADS.templates]] as const) {
			await click(button);
			await browser.waitUntil(async () => (await state()).notices.some((n) => n.text.includes(lead)), { timeout: 5000, timeoutMsg: `No Pro notice after ${button}: ${JSON.stringify(await state())}` });
		}
		const after = await state();
		for (const lead of Object.values(LEADS)) expect(after.notices.find((n) => n.text.includes(lead))?.buttons).toBe(1);
		expect(after.saved).toBe(before.saved);
		expect(after.settings).toBe(before.settings);
		expect(after.areaDisabled).toBe(true);
	});

	it('a Pro user who selects Save project headings saves the headings, with no Pro notice', async () => {
		expect(await setPro(true)).toBe(true);
		await openTab();
		await click('Save project headings');
		await browser.waitUntil(async () => (await state()).notices.some((n) => n.text.includes('Project headings saved.')), { timeout: 5000, timeoutMsg: `No save notice: ${JSON.stringify(await state())}` });
		const s = await state();
		expect(s.notices.filter((n) => n.buttons > 0)).toHaveLength(0);
		expect(s.saved).toContain('"headings"');
	});
});
