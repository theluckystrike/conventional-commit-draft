import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import type DraftPlugin from '../../src/main';
import { lastNotice, pluginId } from './load';

async function prepare(text: string, select = true): Promise<void> {
 await browser.executeObsidian(({ app }, id) => {
  const plugin = (app as unknown as { plugins: { plugins: Record<string, DraftPlugin> } }).plugins.plugins[id]!;
  for (const modal of [...plugin.modals]) modal.close();
  plugin.pro!.signOut();
 }, pluginId);
 await obsidianPage.write('Subjects.md', text);
 await obsidianPage.openFile('Subjects.md');
 await browser.waitUntil(async () => browser.executeObsidian(({ app }, expected) => app.workspace.activeEditor?.editor?.getValue() === expected, text), { timeout: 10000 });
 await browser.executeObsidian(({ app }, selected) => {
  const editor = app.workspace.activeEditor!.editor!;
  editor.setSelection({ line: 0, ch: 0 }, selected ? editor.offsetToPos(editor.getValue().length) : { line: 0, ch: 0 });
 }, select);
 await browser.executeObsidianCommand(`${pluginId}:preview-draft`);
}
async function preview(): Promise<string> {
 const element = await browser.$('.ccd-preview');
 if (!await element.isExisting()) throw new Error('Preview absent. Notice: ' + await lastNotice());
 return element.getText();
}
async function setTitle(title: string): Promise<void> { await browser.$('input[aria-label="Release title"]').setValue(title); }
async function save(title: string): Promise<string> {
 await setTitle(title); await browser.$('button=Save new draft').click();
 await browser.waitUntil(async () => browser.executeObsidian(({ app }, title) => !!app.vault.getFileByPath(`${title}.md`), title), { timeout: 10000 });
 return browser.executeObsidian(async ({ app }, title) => app.vault.read(app.vault.getFileByPath(`${title}.md`)! ), title);
}
describe('Selected commit subjects', () => {
 it('groups types, hash, scope, breaking subjects and review lines then saves', async () => {
  const text = 'a1b2c3d feat(ui): add tabs\nfix(parser)!: reject empty input\nbuild: update bundler\ncustom: update tool\nplain text\n\nfeat:';
  await prepare(text); const report = await preview();
  expect(report).toContain('## Features'); expect(report).toContain('(ui) add tabs (a1b2c3d)');
  expect(report).toContain('**BREAKING** (parser) reject empty input'); expect(report).toContain('## Build');
  expect(report).toContain('Other'); expect(report).toContain('custom'); expect(report).toContain('## Review'); expect(report).toContain('- feat:');
  expect(await save('E2E grouped draft')).toContain('## Features');
  expect(await browser.executeObsidian(async ({ app }) => app.vault.read(app.vault.getFileByPath('Subjects.md')!))).toBe(text);
 });
 it('shows a selection notice and writes no draft for empty selection', async () => {
  await prepare('feat: no selection', false);
  await browser.waitUntil(async () => (await lastNotice()).includes('Select one or more'), { timeout: 5000 });
  expect(await browser.$('.ccd-preview').isExisting()).toBe(false);
 });
 it('shows the 2000 line limit without a partial draft', async () => {
  await prepare('feat: x\n'.repeat(2001));
  await browser.waitUntil(async () => (await lastNotice()).includes('2,000'), { timeout: 5000 });
  expect(await browser.$('.ccd-preview').isExisting()).toBe(false);
 });
 it('keeps Markdown images and HTML literal in DOM and saved Markdown', async () => {
  await prepare('feat: ![pic](asset.png) <img src=x> <b>text</b>');
  const report = await preview(); expect(report).toContain('&lt;img');
  expect(await browser.$('.ccd-modal img').isExisting()).toBe(false); expect(await browser.$('.ccd-modal b').isExisting()).toBe(false);
  const saved = await save('E2E literal draft'); expect(saved).toContain('\\!\\[pic'); expect(saved).toContain('&lt;img');
 });
 it('creates a numbered path while the Sponsors transport is blocked', async () => {
  const source = 'fix: local repair'; await prepare(source);
  await browser.executeObsidian(async ({ app }, id) => {
   const plugin = (app as unknown as { plugins: { plugins: Record<string, DraftPlugin> } }).plugins.plugins[id]!;
   (plugin.pro as unknown as { opts: { http: () => Promise<never> } }).opts.http = () => Promise.reject(new Error('Network disabled'));
   await app.vault.create('E2E collision.md', 'Keep existing draft');
  }, pluginId);
  await setTitle('E2E collision'); await browser.$('button=Save new draft').click();
  await browser.waitUntil(async () => browser.executeObsidian(({ app }) => !!app.vault.getFileByPath('E2E collision 2.md')), { timeout: 10000 });
  const state = await browser.executeObsidian(async ({ app }) => ({ original: await app.vault.read(app.vault.getFileByPath('E2E collision.md')!), source: await app.vault.read(app.vault.getFileByPath('Subjects.md')!), draft: await app.vault.read(app.vault.getFileByPath('E2E collision 2.md')!) }));
  expect(state.original).toBe('Keep existing draft'); expect(state.source).toBe(source); expect(state.draft).toContain('local repair');
 });
 it('keeps math and comment text visible in the saved note', async () => {
  await prepare('feat: keep $x$ and %%visible%%\nreview $y$ %%visible%%');
  const markdown = await save('E2E literal marks');
  const rendered = await browser.executeObsidian(async ({ app, obsidian }, id, markdown) => {
   const plugin = (app as unknown as { plugins: { plugins: Record<string, DraftPlugin> } }).plugins.plugins[id]!;
   const element = document.createElement('div');
   await obsidian.MarkdownRenderer.render(app, markdown, element, 'E2E literal marks.md', plugin);
   return { text: element.textContent, math: element.querySelectorAll('.math').length };
  }, pluginId, markdown);
  expect(rendered.text).toContain('keep $x$ and %%visible%%');
  expect(rendered.text).toContain('review $y$ %%visible%%');
  expect(rendered.math).toBe(0);
 });
 it('blocks saved Pro options while signed out', async () => {
  const result = await browser.executeObsidian(async ({ app }, id) => {
   const plugin = (app as unknown as { plugins: { plugins: Record<string, DraftPlugin> } }).plugins.plugins[id]!;
   return { headings: await plugin.saveHeadings('fix=Repairs'), template: await plugin.saveTemplate({ name: 'Test', title: 'Test', project: 'Atlas', template: '{{sections}}' }) };
  }, pluginId);
  expect(result).toEqual({ headings: false, template: false });
 });
 it('saves and applies Pro headings and a named report template with a test Sponsors answer', async () => {
  await prepare('fix: repair links\nfeat: add search');
  await browser.executeObsidian(async ({ app }, id) => {
   const plugin = (app as unknown as { plugins: { plugins: Record<string, DraftPlugin> } }).plugins.plugins[id]!;
   for (const modal of [...plugin.modals]) modal.close();
   (plugin.pro as unknown as { opts: { http: () => Promise<unknown> } }).opts.http = async () => ({ status: 200, json: { data: { viewer: { login: 'demo-reader' }, user: { sponsorshipForViewerAsSponsor: { isActive: true, isOneTimePayment: false, tier: { name: '$5 a month', monthlyPriceInCents: 500 } } } } } });
   app.secretStorage.setSecret(`${id}-github-token`, 'gho_' + '0'.repeat(36)); await plugin.pro!.refreshNow();
   await plugin.saveHeadings('fix=Repairs\nfeat=New work');
   await plugin.saveTemplate({ name: 'Atlas', title: 'Atlas release', project: 'Atlas', template: '# {{title}}\n\nProject: {{project}}\n\n{{sections}}' });
   plugin.previewSelection('fix: repair links\nfeat: add search');
  }, pluginId);
  await browser.$('.ccd-modal select').selectByVisibleText('Atlas'); const report = await preview();
  expect(report).toContain('# Atlas release'); expect(report).toContain('## Repairs'); expect(report).toContain('## New work');
  expect(report.indexOf('Repairs')).toBeLessThan(report.indexOf('New work'));
  await browser.executeObsidian(({ app }, id) => { const plugin = (app as unknown as { plugins: { plugins: Record<string, DraftPlugin> } }).plugins.plugins[id]!; for (const modal of [...plugin.modals]) modal.close(); plugin.pro!.signOut(); }, pluginId);
 });
});
