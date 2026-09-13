/**
 * BUG-31 — no virtual id carries the `\0` prefix, and `enforce: 'pre'` is what replaced it.
 *
 * The Rollup convention is to prefix a generated module's id with `\0` so nothing else tries
 * to resolve it on disk. It cost every source map of the code this plugin writes: Vite 8 /
 * Rolldown DROPS a `\0`-prefixed module from the map — it never enters `sources` and its
 * segments are gone — silently, with the build green and the `.map` served at 200. The only
 * code invisible to the debugger was the generated code, which is the code worth debugging.
 *
 * What the prefix bought is bought instead by `enforce: 'pre'`: the plugin's `resolveId` runs
 * before `vite:resolve`, so these ids are claimed before anything looks for them on disk.
 *
 * Two assertions of one line each, and they are here because the failure mode is silence: a
 * `\0` put back tomorrow breaks nothing that any other test in this package can see.
 */

import { describe, it, expect } from 'vitest';
import {
  WRAPPER_PREFIX,
  LINK_PREFIX,
  EDGE_PREFIX,
  SW_ID,
  MAIN_ID,
  BOOT_ID,
  DEV_CLIENT_PREFIX,
} from '../src/constants.js';
import { fudic } from '../src/index.js';

const IDS = { WRAPPER_PREFIX, LINK_PREFIX, EDGE_PREFIX, SW_ID, MAIN_ID, BOOT_ID, DEV_CLIENT_PREFIX };

describe('the virtual ids', () => {
  it('none of them starts with `\\0`', () => {
    for (const [name, id] of Object.entries(IDS)) {
      expect([name, id.startsWith('\0')]).toEqual([name, false]);
    }
  });

  it('none of them CONTAINS one either, in case a prefix is composed later', () => {
    for (const [name, id] of Object.entries(IDS)) {
      expect([name, id.includes('\0')]).toEqual([name, false]);
    }
  });
});

/** The plugin's hooks, untyped the way `plugin.test.ts` does it: Vite's `Plugin` union hides them. */
type AnyHook = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** A configured plugin — `resolveId` answers only once `configResolved` has run. */
function configured(): AnyHook {
  const plugin = fudic() as AnyHook;
  plugin.config({});
  plugin.configResolved({ root: process.cwd(), base: '/', command: 'build', build: { outDir: 'dist' } });
  return plugin;
}

describe('the plugin resolves them before anything else can', () => {
  it('declares `enforce: "pre"`, which is the whole replacement for the prefix', () => {
    expect((fudic() as AnyHook).enforce).toBe('pre');
  });

  it('and claims its own ids: `resolveId` returns them unchanged', () => {
    const plugin = configured();
    for (const id of [SW_ID, MAIN_ID, BOOT_ID]) {
      expect(plugin.resolveId(id)).toBe(id);
    }
  });

  it('while leaving anything else to whoever owns it', () => {
    expect(configured().resolveId('./some/real/file.ts')).toBeNull();
  });
});
