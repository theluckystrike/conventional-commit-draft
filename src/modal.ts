import { Modal, Setting, type DropdownComponent, type TextComponent } from 'obsidian';
import { buildDraft, type Selection } from './draft';
import { isPro, onProChange } from './pro';
import type ConventionalCommitDraftPlugin from './main';

export class DraftModal extends Modal {
	releaseTitle = 'Release draft';
	projectName = 'Project';
	templateName = '';
	private preview: HTMLElement | null = null;
	private titleInput: TextComponent | null = null;
	private projectInput: TextComponent | null = null;
	private templateInput: DropdownComponent | null = null;
	private unbind: (() => void) | null = null;
	constructor(readonly plugin: ConventionalCommitDraftPlugin, readonly commitSelection: Selection) { super(plugin.app); }
	onOpen(): void {
		this.setTitle('Preview release draft'); this.modalEl.addClass('ccd-modal');
		this.contentEl.createEl('p', { text: `${this.commitSelection.commits.length} parsed subjects. ${this.commitSelection.review.length} lines to review. Source note stays unchanged.` });
		new Setting(this.contentEl).setName('Release title').addText((text) => { this.titleInput = text; text.setValue(this.releaseTitle).onChange((value) => { this.releaseTitle = value; this.redraw(); }); text.inputEl.maxLength = 200; text.inputEl.setAttribute('aria-label', 'Release title'); });
		new Setting(this.contentEl).setName('Project name').addText((text) => { this.projectInput = text; text.setValue(this.projectName).onChange((value) => { this.projectName = value; this.redraw(); }); text.inputEl.maxLength = 200; text.inputEl.setAttribute('aria-label', 'Project name'); });
		new Setting(this.contentEl).setName('Saved report templates (pro)').setDesc('Save named templates in the plugin settings.').addDropdown((dropdown) => {
			this.templateInput = dropdown;
			dropdown.onChange((name) => {
				this.templateName = name;
				const saved = isPro() ? this.plugin.settings.templates.find((item) => item.name === name) : undefined;
				if (saved) { this.releaseTitle = saved.title; this.projectName = saved.project; this.titleInput?.setValue(this.releaseTitle); this.projectInput?.setValue(this.projectName); }
				this.redraw();
			});
		});
		this.preview = this.contentEl.createEl('pre', { cls: 'ccd-preview', attr: { 'aria-label': 'Draft preview', tabindex: '0' } });
		this.redraw(); this.unbind = onProChange(() => this.redraw());
		new Setting(this.contentEl).addButton((button) => button.setButtonText('Cancel').onClick(() => this.close())).addButton((button) => button.setButtonText('Save new draft').setCta().onClick(async () => {
			button.setDisabled(true);
			const file = await this.plugin.saveDraft(this.commitSelection, this.releaseTitle, this.projectName, this.templateName);
			if (file) this.close(); else button.setDisabled(false);
		}));
	}
	redraw(): void {
		if (this.templateInput) {
			const paid = isPro();
			if (!paid) this.templateName = '';
			this.templateInput.selectEl.empty();
			this.templateInput.addOption('', 'Default report').setDisabled(!paid);
			if (paid) for (const template of this.plugin.settings.templates) this.templateInput.addOption(template.name, template.name);
			this.templateInput.setValue(this.templateName);
		}
		if (this.preview) this.preview.textContent = buildDraft(this.commitSelection, this.plugin.options(this.releaseTitle, this.projectName, this.templateName));
	}
	onClose(): void { this.unbind?.(); this.unbind = null; this.plugin.modals.delete(this); this.contentEl.empty(); }
}
