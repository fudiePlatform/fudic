/**
 * The invariant that defines this package, checked instead of promised: no branch
 * of `src/` may name a DOM global. A form model that needs a DOM to run is a form
 * model that cannot run on the server, and this whole package exists so the same
 * schema file works on both ends.
 *
 * It reads the sources rather than mocking `globalThis`, because a cast is exactly
 * how a DOM reference would sneak in past the type checker.
 */

import { describe, expect, it } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const SRC = fileURLToPath(new URL('../src', import.meta.url));

const FORBIDDEN = [
  'document',
  'window',
  'navigator',
  'HTMLElement',
  'Element',
  'ShadowRoot',
  'customElements',
] as const;

async function sources(dir: string): Promise<readonly string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await sources(full)));
    } else if (entry.name.endsWith('.ts')) {
      files.push(full);
    }
  }
  return files;
}

describe('zero DOM', () => {
  it('names no DOM global anywhere under src/', async () => {
    const files = await sources(SRC);
    // If the walk found nothing, the test is passing for the wrong reason.
    expect(files.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of files) {
      const code = await readFile(file, 'utf8');
      for (const name of FORBIDDEN) {
        // Word boundary on both sides: `documentation` in a comment is not a hit.
        if (new RegExp(`\\b${name}\\b`).test(code)) {
          offenders.push(`${file} → ${name}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
