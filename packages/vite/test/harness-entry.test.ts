/**
 * `@fudic/vite/harness` is what `@fudic/testing` loads in every worker, and it must not load
 * Vite: that is the whole reason it is an entry of its own (SDD-57).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as harness from '../src/harness.js';

const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

/** Every bare specifier `entry` loads at run time, following its relative imports. */
function staticSpecifiers(entry: string): Set<string> {
  const bare = new Set<string>();
  const seen = new Set<string>();
  const visit = (file: string): void => {
    if (seen.has(file)) return;
    seen.add(file);
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/^(?:import|export)\s+(type\s+)?[^;]*?from\s+'([^']+)'/gmsu)) {
      const [, typeOnly, specifier] = match as unknown as [string, string | undefined, string];
      if (typeOnly !== undefined) continue;
      if (specifier.startsWith('.')) visit(join(dirname(file), specifier.replace(/\.js$/u, '.ts')));
      else bare.add(specifier);
    }
  };
  visit(entry);
  return bare;
}

describe('@fudic/vite/harness', () => {
  it('loads neither Vite nor the checker', () => {
    const loaded = staticSpecifiers(join(src, 'harness.ts'));
    expect(loaded.has('vite')).toBe(false);
    expect(loaded.has('@fudic/typecheck')).toBe(false);
    // The walk does reach the compiler, so the absence above is real.
    expect(loaded.has('@fudic/compiler')).toBe(true);
  });

  it('exposes what the harness paints and serves with', () => {
    expect(Object.keys(harness).sort()).toEqual(
      [
        'API_SCHEME',
        'ApiProject',
        'ROOT_FILE_PREFIX',
        'SERVER_ROOT_ID',
        'classifyError',
        'discoverRoutes',
        'drainStream',
        'edgeContext',
        'emitRenderChunk',
        'matchRouteBuild',
        'nodeIo',
        'renderErrorPage',
        'resolveOptions',
        'routeApi',
        'routeUsesDi',
      ],
    );
  });
});
