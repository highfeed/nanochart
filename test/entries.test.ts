import { beforeAll, describe, expect, it, vi } from 'vitest';
import { installCanvas, mount } from './helpers/dom.js';

beforeAll(installCanvas);

/**
 * Each wrapper entry, loaded into a module graph holding nothing else from the
 * package.
 *
 * The built-in series register themselves from the package entry, so a test
 * file that imports it — for a theme, for a plugin — proves nothing about the
 * wrappers: the registration it observes is its own. Resetting the module
 * registry before each import starts from an empty one, which is what a page
 * that imports only `nanochart.js/react` starts from.
 */
const ENTRIES = {
  react: () => import('../src/react.js'),
  vue: () => import('../src/vue.js'),
  svelte: () => import('../src/svelte.js'),
};

describe('wrapper entries', () => {
  for (const [name, load] of Object.entries(ENTRIES)) {
    it(`${name} registers the built-in series on its own`, async () => {
      vi.resetModules();
      const registry = await import('../src/core/registry.js');
      expect(registry.getSeriesRenderer('line')).toBeUndefined();
      await load();
      expect(registry.getSeriesRenderer('line')).toBeDefined();
      expect(registry.getSeriesRenderer('pie')).toBeDefined();
    });
  }

  it('builds a chart through the svelte action alone', async () => {
    vi.resetModules();
    const { nanochart } = await import('../src/svelte.js');
    const host = mount();
    const action = nanochart(host, {
      animation: false,
      height: 200,
      series: [{ id: 'a', type: 'line', data: [1, 2, 3] }],
    });
    expect(host.querySelector('canvas')).toBeTruthy();
    action.destroy();
  });
});
