import { describe, it, expect } from 'vitest';
import { createChunkLoader, importChunk } from '../../src/hydrate/chunks.js';
import { browserRegistry } from '../../src/hydrate/registry.js';
import { TestRegistry } from './_page.js';

describe('one chunk per tag', () => {
  it('downloads once and defines, however many callers ask at once', async () => {
    const registry = new TestRegistry();
    const asked: string[] = [];
    const loader = createChunkLoader({
      registry,
      resolveChunk: (tag) => `/assets/h/${tag}-abcd1234.js`,
      importModule: async (url) => {
        asked.push(url);
        // A real download does not resolve in the same turn, and that is the whole point of
        // `inflight`: the second caller has to find a promise, not a defined tag.
        await Promise.resolve();
        registry.define('chk-one', class extends HTMLElement {});
      },
    });

    await Promise.all([loader.ensureDefined('chk-one'), loader.ensureDefined('chk-one')]);
    await loader.ensureDefined('chk-one');

    expect(asked).toEqual(['/assets/h/chk-one-abcd1234.js']);
    expect(registry.get('chk-one')).toBeTypeOf('function');
  });

  it('a tag already defined is never asked for', async () => {
    const registry = new TestRegistry();
    registry.define('chk-two', class extends HTMLElement {});
    let asked = 0;
    const loader = createChunkLoader({
      registry,
      resolveChunk: (tag) => `/${tag}.js`,
      importModule: async () => {
        asked += 1;
      },
    });

    await loader.ensureDefined('chk-two');
    expect(asked).toBe(0);
  });

  it('the platform registry is the default, and it answers the three questions', async () => {
    expect(browserRegistry.get('chk-absent')).toBeUndefined();
    const ctor = class extends HTMLElement {};
    customElements.define('chk-real', ctor);
    expect(browserRegistry.get('chk-real')).toBe(ctor);
    let defined = false;
    await browserRegistry.whenDefined('chk-real').then(() => {
      defined = true;
    });
    expect(defined).toBe(true);
    expect(() => browserRegistry.upgrade(document.createElement('chk-real'))).not.toThrow();
  });

  it('the default loader is a bare dynamic import: a URL that is not there rejects', async () => {
    await expect(importChunk('./nothing-is-published-here.js')).rejects.toBeDefined();
  });
});
