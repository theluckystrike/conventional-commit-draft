import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from 'obsidian-test-mocks/obsidian';
import Plugin from '../src/main';
import { draftFromText, numberedPath, parseSelection } from '../src/draft';
import { DraftModal } from '../src/modal';
import { bindPro, resetPro } from '../src/pro';
import { NEW_TEMPLATE } from '../src/options';
import manifest from '../manifest.json';

afterEach(() => { resetPro(); vi.restoreAllMocks(); });
function make() {
 const app = App.createConfigured__({ files: {} });
 const plugin = new Plugin(app as never, manifest as never);
 return { app, plugin };
}

describe('Review defects', () => {
 it('keeps math and comment marks literal in subjects and Review', () => {
  const report = draftFromText('feat: keep $x$ and %%visible%%\nreview $y$ %%visible%%');
  expect(report).toContain('- keep \\$x\\$ and \\%\\%visible\\%\\%');
  expect(report).toContain('- review \\$y\\$ \\%\\%visible\\%\\%');
 });
 it('uses short UTF-8 file names without split Unicode characters', () => {
  for (const title of ['界'.repeat(200), '😀'.repeat(49) + 'x😀', '\u0344'.repeat(200)]) {
   const path = numberedPath(title, 10000);
   expect(new TextEncoder().encode(path.normalize()).length).toBeLessThanOrEqual(255);
   expect(path).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u);
  }
 });
 it('does not use Windows device names for draft files', () => {
  for (const title of ['CON', 'nul', 'Aux.release', 'COM1', 'LPT9']) {
   expect(numberedPath(title, 1)).toBe(`_${title}.md`);
  }
 });
 it('does not start a refresh timer when layout becomes ready after unload', async () => {
  const { app, plugin } = make();
  let ready: (() => unknown) | undefined;
  const cleanups: (() => unknown)[] = [];
  vi.spyOn(plugin, 'register').mockImplementation((fn) => { cleanups.push(fn); });
  vi.spyOn(app.workspace, 'onLayoutReady').mockImplementation((fn) => { ready = fn; });
  vi.spyOn(plugin, 'loadData').mockResolvedValue(null);
  await plugin.onload();
  const interval = vi.spyOn(window, 'setInterval').mockReturnValue(1 as never);
  const refresh = vi.spyOn(plugin.pro!, 'refresh');
  plugin.onunload();
  for (const cleanup of cleanups) cleanup();
  ready!();
  expect(interval).not.toHaveBeenCalled();
  expect(refresh).not.toHaveBeenCalled();
 });
 it('updates template choices when Pro changes with the preview open', () => {
  const { plugin } = make();
  let paid = false;
  let changed: (() => void) | undefined;
  bindPro({ isPro: () => paid, onChange: (fn: () => void) => { changed = fn; return () => undefined; } } as never);
  plugin.settings.templates = [{ ...NEW_TEMPLATE, name: 'Atlas' }];
  const modal = new DraftModal(plugin, parseSelection('fix: x'));
  modal.onOpen();
  const select = modal.contentEl.querySelector('select')!;
  expect(select.disabled).toBe(true);
  paid = true; changed!();
  expect(select.disabled).toBe(false);
  expect([...select.options].map((option) => option.value)).toContain('Atlas');
  paid = false; changed!();
  expect(select.disabled).toBe(true);
  expect([...select.options].map((option) => option.value)).toEqual(['']);
  modal.onClose();
 });
});
