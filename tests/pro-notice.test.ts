import { afterEach, describe, expect, it, vi } from 'vitest';
import { App, Notice, Setting } from 'obsidian-test-mocks/obsidian';
import type { SponsorsManager } from '../src/license/index';
import Plugin from '../src/main';
import { ConventionalCommitDraftSettingTab } from '../src/settings';
import { bindPro, PRO_HEADINGS, PRO_TEMPLATES, resetPro } from '../src/pro';
import manifest from '../manifest.json';

// A free user can select Save project headings and Save report template. The click shows the shared Pro notice
// with a Sponsor button. Nothing is saved, and the Pro fields keep the saved value. A Pro user saves, as before.
const PITCH = 'Sponsor on GitHub, then sign in from the plugin settings.';

function fakePro(pro: boolean): SponsorsManager {
	return {
		isPro: () => pro,
		onChange: () => () => undefined,
		hasToken: () => false,
		isChecking: () => false,
		getState: () => ({ status: 'unchecked', lastAttemptAt: 0 }),
		config: { sponsorLogin: 'theluckystrike', source: 'conventional-commit-draft' },
	} as unknown as SponsorsManager;
}

function setup(pro: boolean) {
	const app = App.createConfigured__({ files: {} });
	const plugin = new Plugin(app as never, manifest as never);
	const saveData = vi.spyOn(plugin, 'saveData').mockResolvedValue();
	bindPro(fakePro(pro));
	const shown: { text: string; buttons: number }[] = [];
	vi.spyOn(Notice.prototype as unknown as { constructor__(): void }, 'constructor__').mockImplementation(function (this: Notice) {
		shown.push({ text: this.messageEl.textContent ?? '', buttons: this.messageEl.querySelectorAll('.pf-pro-notice-sponsor').length });
	});
	const tab = new ConventionalCommitDraftSettingTab(app as never, plugin);
	const el = document.createElement('div');
	type Item = { name?: string; render?: (s: Setting) => void; items?: Item[] };
	const walk = (items: Item[]): Item[] => items.flatMap((i) => [i, ...walk(i.items ?? [])]);
	for (const item of walk(tab.productSettingDefinitions() as Item[])) if (item.render) item.render(new Setting(el));
	const button = (text: string) => [...el.querySelectorAll('button')].find((b) => b.textContent === text)!;
	return { plugin, el, shown, saveData, headings: button('Save project headings'), template: button('Save report template') };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('Pro save buttons in the settings tab', () => {
	afterEach(() => { resetPro(); vi.restoreAllMocks(); });

	it('a free user who selects Save project headings or Save report template gets the Pro notice with a Sponsor button, and nothing is saved', async () => {
		const { plugin, el, shown, saveData, headings, template } = setup(false);
		const before = structuredClone(plugin.settings);
		expect(headings.disabled).toBe(false);
		expect(template.disabled).toBe(false);
		headings.click(); await flush();
		template.click(); await flush();
		expect(shown).toEqual([
			{ text: `${PRO_HEADINGS} ${PITCH}Sponsor on GitHub`, buttons: 1 },
			{ text: `${PRO_TEMPLATES} ${PITCH}Sponsor on GitHub`, buttons: 1 },
		]);
		expect(saveData).not.toHaveBeenCalled();
		expect(plugin.settings).toEqual(before);
		// The Pro fields stay read-only for a free user and show the saved headings.
		const area = el.querySelector('textarea')!;
		expect(area.disabled).toBe(true);
		expect(area.value).toBe(before.headings);
	});

	it('a Pro user who selects Save project headings saves the headings, with no Pro notice', async () => {
		const { plugin, shown, saveData, headings } = setup(true);
		headings.click(); await flush();
		expect(saveData).toHaveBeenCalledWith(plugin.settings);
		expect(shown).toEqual([{ text: 'Project headings saved.', buttons: 0 }]);
	});
});
