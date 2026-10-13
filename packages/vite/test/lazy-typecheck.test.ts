/**
 * The plugin loads the checker only when a check is about to run.
 *
 * `@fudic/typecheck` pulls in TypeScript, most of a second, and `vite preview` loads this
 * plugin without checking anything. So no module of the plugin may load that entry at run
 * time: what they print and compare comes from `@fudic/typecheck/problems`, and the machine
 * arrives through `import()` in `configureServer` and `buildStart`.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

/**
 * Every bare specifier the plugin loads at run time from `index.ts`, following its relative
 * imports. An `import type` is erased; any other static `import`/`export … from` stays (with
 * `verbatimModuleSyntax`, even one whose names are all `type`). A dynamic `import()` is not
 * a static edge, which is the point.
 */
function staticSpecifiers(entry: string): Set<string> {
  const bare = new Set<string>();
  const seen = new Set<string>();
  const visit = (file: string): void => {
    if (seen.has(file)) {
      return;
    }
    seen.add(file);
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/^(?:import|export)\s+(type\s+)?[^;]*?from\s+'([^']+)'/gmsu)) {
      const [, typeOnly, specifier] = match as unknown as [string, string | undefined, string];
      if (typeOnly !== undefined) {
        continue;
      }
      if (specifier.startsWith('.')) {
        visit(join(dirname(file), specifier.replace(/\.js$/u, '.ts')));
      } else {
        bare.add(specifier);
      }
    }
  };
  visit(entry);
  return bare;
}

describe('importing @fudic/vite does not load the checker', () => {
  it('no module of the plugin loads `@fudic/typecheck` (nor TypeScript) statically', () => {
    const loaded = staticSpecifiers(join(src, 'index.ts'));
    expect(loaded.has('@fudic/typecheck')).toBe(false);
    expect(loaded.has('typescript')).toBe(false);
    // The light entry IS loaded: the walk reaches the reporter, so the absence above is real.
    expect(loaded.has('@fudic/typecheck/problems')).toBe(true);
  });

  it('the checker arrives on demand, in the two hooks that run one', () => {
    const plugin = readFileSync(join(src, 'plugin.ts'), 'utf8');
    expect(plugin.match(/await import\('@fudic\/typecheck'\)/gu)).toHaveLength(2);
  });
});
