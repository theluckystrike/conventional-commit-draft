import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from 'obsidian-test-mocks/obsidian';
import { SponsorsManager } from '../src/license/index';
import Plugin from '../src/main';
import { DEFAULT_SETTINGS, NEW_TEMPLATE, normalizeSettings } from '../src/options';
import { DEFAULT_HEADINGS, DEFAULT_OPTIONS, buildDraft, parseSelection } from '../src/draft';
import { bindPro, isPro, resetPro, SPONSORS } from '../src/pro';
import { DraftModal } from '../src/modal';
import manifest from '../manifest.json';
afterEach(() => { resetPro(); vi.restoreAllMocks(); });
function make(files: Record<string, string> = {}) {
 const app = App.createConfigured__({ files: { 'Source.md': 'feat: add search\nfix: repair links', ...files } });
 const plugin = new Plugin(app as never, manifest as never);
 vi.spyOn(plugin, 'saveData').mockResolvedValue();
 return { app, plugin };
}
function pro(on = true) { bindPro({ isPro: () => on, onChange: () => () => undefined } as never); }
describe('Local drafts and source safety', () => {
 it('creates numbered local notes while signed out and leaves the source unchanged', async () => {
  const { app, plugin } = make({ 'Release draft.md': 'Keep this report' });
  const source = app.vault.getFileByPath('Source.md')!;
  const text = await app.vault.read(source);
  const selection = parseSelection(text);
  const one = await plugin.saveDraft(selection, 'Release draft', 'Atlas');
  const two = await plugin.saveDraft(selection, 'Release draft', 'Atlas');
  expect(one?.path).toBe('Release draft 2.md'); expect(two?.path).toBe('Release draft 3.md');
  expect(await app.vault.read(source)).toBe(text);
  expect(await app.vault.read(app.vault.getFileByPath('Release draft.md')!)).toBe('Keep this report');
  expect(await app.vault.read(one! as never)).toContain('## Features');
  expect(isPro()).toBe(false);
 });
 it('no selection or over limit opens no modal and creates no partial draft', () => {
  const { app, plugin } = make(); const create = vi.spyOn(app.vault, 'create');
  const open = vi.spyOn(DraftModal.prototype, 'open');
  expect(plugin.previewSelection('')).toBeNull();
  expect(plugin.previewSelection('feat: x\n'.repeat(2001))).toBeNull();
  expect(create).not.toHaveBeenCalled(); expect(open).not.toHaveBeenCalled();
 });
 it('accepts exactly 2000 nonblank lines and ignores extra blank lines', () => {
  expect(parseSelection(('feat: x\n\n').repeat(2000)).count).toBe(2000);
 });
 it('retains a report of review lines when no line parses', async () => {
  const { app, plugin } = make();
  const file = await plugin.saveDraft(parseSelection('bad subject\nfeat:'), 'Review draft', 'Atlas');
  expect(await app.vault.read(file! as never)).toContain('## Review\n\n- bad subject\n- feat:');
 });
 it('retries a path created between the check and write', async () => {
  const { app, plugin } = make(); const create = app.vault.create.bind(app.vault);
  let first = true;
  vi.spyOn(app.vault, 'create').mockImplementation(async (path, text, options) => {
   if (first) { first = false; await create(path, 'Race winner', options); throw new Error('exists'); }
   return create(path, text, options);
  });
  const file = await plugin.saveDraft(parseSelection('fix: x'), 'Race', 'Atlas');
  expect(file?.path).toBe('Race 2.md');
  expect(await app.vault.read(app.vault.getFileByPath('Race.md')!)).toBe('Race winner');
 });
 it('shows write failure and permits a retry', async () => {
  const { app, plugin } = make(); const create = vi.spyOn(app.vault, 'create').mockRejectedValueOnce(new Error('disk full'));
  expect(await plugin.saveDraft(parseSelection('fix: x'), 'Retry', 'Atlas')).toBeNull();
  expect(await plugin.saveDraft(parseSelection('fix: x'), 'Retry', 'Atlas')).not.toBeNull();
  expect(create).toHaveBeenCalledTimes(2);
 });
 it('has a literal DOM preview with no image or HTML element from a subject', () => {
  const { plugin } = make(); const modal = new DraftModal(plugin, parseSelection('feat: ![pic](x.png) <img src=x>'));
  modal.onOpen();
  expect(modal.contentEl.querySelector('img')).toBeNull();
  expect(modal.contentEl.querySelector('pre')?.textContent).toContain('&lt;img src\\=x&gt;');
  modal.onClose();
 });
 it('closing the preview creates no note', () => {
  const { app, plugin } = make(); const create = vi.spyOn(app.vault, 'create');
  const modal = new DraftModal(plugin, parseSelection('fix: x')); modal.onOpen(); modal.onClose();
  expect(create).not.toHaveBeenCalled(); expect(plugin.modals.size).toBe(0);
 });
});
describe('Pro guards and saved data', () => {
 it('uses the reference Sponsors terms', () => expect(SPONSORS).toMatchObject({ clientId: 'Ov23lic5UPGPZqhBlBGg', sponsorLogin: 'theluckystrike', minMonthlyUsd: 5, oneTimeUsd: 15, oneTimeMonths: 0, scope: 'read:user' }));
 it('blocks both save actions and the use of saved settings with Pro off', async () => {
  const { plugin } = make(); plugin.settings = { headings: 'fix=Repairs', templates: [{ ...NEW_TEMPLATE, template: 'Paid {{sections}}' }] };
  expect(await plugin.saveHeadings('feat=New work')).toBe(false);
  expect(await plugin.saveTemplate(NEW_TEMPLATE)).toBe(false);
  expect(plugin.options('Release draft', 'Project', NEW_TEMPLATE.name)).toEqual(DEFAULT_OPTIONS);
  expect(plugin.saveData).not.toHaveBeenCalled();
 });
 it('saves and uses ordered headings and named report templates with Pro on', async () => {
  pro(); const { plugin } = make();
  expect(await plugin.saveHeadings('fix=Repairs\nfeat=New work')).toBe(true);
  const t = { ...NEW_TEMPLATE, title: 'Version 2', project: 'Atlas', template: '# {{project}} {{title}}\n\n{{sections}}' };
  expect(await plugin.saveTemplate(t)).toBe(true);
  const report = buildDraft(parseSelection('feat: y\nfix: x'), plugin.options(t.title, t.project, t.name));
  expect(report).toBe('# Atlas Version 2\n\n## Repairs\n\n- x\n\n## New work\n\n- y\n');
  expect(plugin.saveData).toHaveBeenCalledTimes(2);
 });
 it('rechecks Pro at save after a preview used saved headings', async () => {
  pro(); const { plugin, app } = make(); plugin.settings.headings = 'fix=Repairs';
  expect(plugin.options().headings).toBe('fix=Repairs'); pro(false);
  const file = await plugin.saveDraft(parseSelection('fix: x'), 'Recheck', 'Atlas');
  expect(await app.vault.read(file! as never)).toContain('## Fixes');
 });
 it('rejects duplicate heading keys and templates that omit or repeat sections', async () => {
  pro(); const { plugin } = make();
  await expect(plugin.saveHeadings('fix=One\nfix=Two')).rejects.toThrow('unique');
  await expect(plugin.saveTemplate({ ...NEW_TEMPLATE, template: 'none' })).rejects.toThrow('sections');
  await expect(plugin.saveTemplate({ ...NEW_TEMPLATE, template: '{{sections}}{{sections}}' })).rejects.toThrow('sections');
  expect(plugin.saveData).not.toHaveBeenCalled();
 });
 it('replaces a template with the same name and limits the saved list', async () => {
  pro(); const { plugin } = make();
  for (let i = 0; i < 20; i++) await plugin.saveTemplate({ ...NEW_TEMPLATE, name: String(i) });
  await expect(plugin.saveTemplate(NEW_TEMPLATE)).rejects.toThrow('20');
  await plugin.saveTemplate({ ...NEW_TEMPLATE, name: '0', title: 'New title' });
  expect(plugin.settings.templates).toHaveLength(20); expect(plugin.settings.templates[0]?.title).toBe('New title');
 });
 it('loads defaults and drops malformed saved values', async () => {
  const { plugin } = make(); await plugin.loadSettings(); expect(plugin.settings).toEqual(DEFAULT_SETTINGS);
  expect(normalizeSettings({ headings: 5, templates: [null, {}, { ...NEW_TEMPLATE, template: 'missing' }] })).toEqual(DEFAULT_SETTINGS);
  expect(normalizeSettings({ headings: 'bad' }).headings).toBe(DEFAULT_HEADINGS);
 });
});

describe('Signed-out network behavior', () => {
 it('initialization, refresh, draft creation, and sign out send no request', async () => {
  const http = vi.fn(async () => { throw new Error('Network disabled'); });
  const manager = new SponsorsManager({ config: SPONSORS, http, tokens: { get: () => null, set: () => undefined, clear: () => undefined }, store: { load: () => null, save: () => undefined } });
  manager.init(); bindPro(manager); await manager.refresh(); await manager.refreshNow();
  const { plugin } = make(); expect(await plugin.saveDraft(parseSelection('feat: local feature'), 'Local', 'Atlas')).not.toBeNull();
  manager.signOut(); manager.dispose(); expect(http).not.toHaveBeenCalled();
 });
});
