import { browser, expect } from '@wdio/globals';
import { pluginId, reloadPlugin } from './load';
describe('Plugin lifecycle', () => {
 it('loads and reloads without errors', async () => expect(await reloadPlugin(pluginId)).toEqual({ enabled: true, reloaded: true, errors: [] }));
});
