import { Notice, PluginSettingTab, type Setting, type SettingDefinitionItem } from 'obsidian';
import { sponsorsSettingItems } from './license/github-obsidian';
import { NEW_TEMPLATE } from './options';
import { isPro, PRO_UI } from './pro';
import type ConventionalCommitDraftPlugin from './main';
import { helloSettingItems } from './hello/settings';
export { DEFAULT_SETTINGS, normalizeSettings } from './options';

export class ConventionalCommitDraftSettingTab extends PluginSettingTab {
	constructor(app: ConstructorParameters<typeof PluginSettingTab>[0], readonly draftPlugin: ConventionalCommitDraftPlugin) { super(app, draftPlugin); }
	getSettingDefinitions(): SettingDefinitionItem[] {
		// The product rows, then the "More from NoteMods" card (packages/hello).
		return [...this.productSettingDefinitions(), ...helloSettingItems()];
	}

	productSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{ name: 'Free draft workflow', desc: 'Select commit subjects in a Markdown editor. Run Preview release draft from selection, check the text, then save a new note at the vault root.' },
			...(this.draftPlugin.pro ? sponsorsSettingItems(this.draftPlugin.pro, PRO_UI) : []),
			{ type: 'group', heading: 'Project type names and heading order (Pro)', items: [{ name: 'Type headings', desc: 'Use type=heading lines. Line order sets the report order. Types without a saved heading stay in Other.', render: (setting: Setting) => {
				let value = this.draftPlugin.settings.headings;
				setting.addTextArea((text) => text.setValue(value).setDisabled(!isPro()).onChange((text) => { value = text; }));
				setting.addButton((button) => button.setButtonText('Save project headings').setDisabled(!isPro()).onClick(async () => {
					try { if (await this.draftPlugin.saveHeadings(value)) new Notice('Project headings saved.'); }
					catch (error) { new Notice(error instanceof Error ? error.message : String(error)); }
				}));
			} }] },
			{ type: 'group', heading: 'Report templates (Pro)', items: [
				{ name: 'Saved templates', desc: this.draftPlugin.settings.templates.map((template) => template.name).join(', ') || 'No saved templates.' },
				{ name: 'Save a named report template', desc: 'Use one {{sections}} slot. {{title}} and {{project}} use literal text. Reuse a name to replace that template. Up to 20 templates.', render: (setting: Setting) => {
					const template = { ...NEW_TEMPLATE };
					for (const [key, label] of [['name', 'Template name'], ['title', 'Saved release title'], ['project', 'Saved project name']] as const) setting.addText((text) => { text.setPlaceholder(label).setValue(template[key]).setDisabled(!isPro()).onChange((value) => { template[key] = value; }); text.inputEl.setAttribute('aria-label', label); });
					setting.addTextArea((text) => { text.setValue(template.template).setDisabled(!isPro()).onChange((value) => { template.template = value; }); text.inputEl.setAttribute('aria-label', 'Report template text'); });
					setting.addButton((button) => button.setButtonText('Save report template').setDisabled(!isPro()).onClick(async () => {
						try { if (await this.draftPlugin.saveTemplate(template)) new Notice('Report template saved.'); }
						catch (error) { new Notice(error instanceof Error ? error.message : String(error)); }
					}));
				} },
			] },
		];
	}
}
