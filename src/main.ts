import { Notice, Plugin, normalizePath, type Editor, type TFile } from 'obsidian';
import type { SponsorsManager } from './license/index';
import { createGitHubSponsors } from './license/github-obsidian';
import { DEFAULT_OPTIONS, buildDraft, headingMap, numberedPath, parseSelection, validateTemplate, type DraftOptions, type Selection } from './draft';
import { DEFAULT_SETTINGS, normalizeSettings, type ConventionalCommitDraftSettings, type ReportTemplate } from './options';
import { SPONSORS, bindPro, isPro, resetPro } from './pro';
import { ConventionalCommitDraftSettingTab } from './settings';
import { DraftModal } from './modal';
import { setupHello } from './hello/index';
import WHATS_NEW from './whats-new.json';

export default class ConventionalCommitDraftPlugin extends Plugin {
	settings: ConventionalCommitDraftSettings = { ...DEFAULT_SETTINGS, templates: [] };
	pro: SponsorsManager | null = null;
	private settingTab: ConventionalCommitDraftSettingTab | null = null;
	readonly modals = new Set<DraftModal>();
	private saving = false;
	async onload(): Promise<void> {
		// First: "What's new" reads its state before the settings load (packages/hello). It does not wait.
		setupHello(this, WHATS_NEW);
		await this.loadSettings();
		const pro = createGitHubSponsors(this.app, this.manifest.id, SPONSORS, this);
		pro.init();
		this.pro = pro;
		bindPro(pro);
		this.settingTab = new ConventionalCommitDraftSettingTab(this.app, this);
		this.addSettingTab(this.settingTab);
		this.register(pro.onChange(() => this.settingTab?.update()));
		this.addCommand({ id: 'preview-draft', name: 'Preview release draft from selection', editorCallback: (editor: Editor) => this.previewSelection(editor.getSelection()) });
		let unloaded = false;
		this.register(() => { unloaded = true; });
		this.app.workspace.onLayoutReady(() => {
			if (unloaded) return;
			void pro.refresh();
			this.registerInterval(window.setInterval(() => void pro.refresh(), 6 * 60 * 60 * 1000));
		});
	}
	onunload(): void { for (const modal of [...this.modals]) modal.close(); resetPro(); }
	async loadSettings(): Promise<void> { this.settings = normalizeSettings(await this.loadData() as unknown); }
	async saveSettings(): Promise<void> { await this.saveData(this.settings); }
	previewSelection(text: string): DraftModal | null {
		try { const modal = new DraftModal(this, parseSelection(text)); this.modals.add(modal); modal.open(); return modal; }
		catch (error) { new Notice(error instanceof Error ? error.message : String(error)); return null; }
	}
	options(title = 'Release draft', project = 'Project', templateName = ''): DraftOptions {
		const saved = isPro() ? this.settings.templates.find((item) => item.name === templateName) : undefined;
		return { ...DEFAULT_OPTIONS, title, project, headings: isPro() ? this.settings.headings : DEFAULT_OPTIONS.headings, template: saved?.template ?? DEFAULT_OPTIONS.template };
	}
	async saveHeadings(text: string): Promise<boolean> {
		if (!this.requirePro()) return false;
		headingMap(text); this.settings.headings = text; await this.saveSettings(); return true;
	}
	async saveTemplate(template: ReportTemplate): Promise<boolean> {
		if (!this.requirePro()) return false;
		validateTemplate(template.template);
		if (!template.name.trim()) throw new Error('Enter a template name.');
		const normalized = normalizeSettings({ templates: [template] }).templates[0];
		if (!normalized) throw new Error('Enter valid template text.');
		const old = this.settings.templates.findIndex((item) => item.name === normalized.name);
		if (old < 0 && this.settings.templates.length >= 20) throw new Error('The limit is 20 saved templates. Use an existing name to replace a template.');
		if (old >= 0) this.settings.templates[old] = normalized;
		else this.settings.templates.push(normalized);
		await this.saveSettings(); this.settingTab?.update(); return true;
	}
	private requirePro(): boolean {
		if (isPro()) return true;
		new Notice('This is a pro feature. Sponsor on GitHub, then sign in from the plugin settings.'); return false;
	}
	async saveDraft(selection: Selection, title: string, project: string, templateName = ''): Promise<TFile | null> {
		if (this.saving) return null;
		this.saving = true;
		try {
			const report = buildDraft(selection, this.options(title, project, templateName));
			for (let n = 1; n <= 10000; n++) {
				const path = normalizePath(numberedPath(title, n));
				if (this.app.vault.getAbstractFileByPath(path)) continue;
				try { const file = await this.app.vault.create(path, report); new Notice(`Saved ${selection.count} subjects to ${file.path}.`); return file; }
				catch (error) { if (this.app.vault.getAbstractFileByPath(path)) continue; throw error; }
			}
			throw new Error('No draft path is free in the first 10,000 names.');
		} catch (error) { new Notice(`Could not save the draft. ${error instanceof Error ? error.message : String(error)}`); return null; }
		finally { this.saving = false; }
	}
}
