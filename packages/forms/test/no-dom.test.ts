/**
 * The invariant that defines this package, checked instead of promised: the MODEL names no
 * DOM global. A form model that needs a DOM to run is a form model that cannot run on the
 * server, and this whole package exists so the same schema file works on both ends.
 *
 * **It is measured by REACHABILITY, not by folder.** SDD-34 adds two entry points that are
 * browser code by definition — `./dom`, the six bind functions, and `./element`, the base of
 * a control-component — so "nothing under `src/`" stopped being the invariant the moment they
 * landed. What still has to hold, and what the server actually depends on, is that NOTHING
 * REACHABLE FROM `src/index.ts` touches the DOM: import the model and you get the model.
 *
 * So the test follows the imports from the root entry point and checks what it finds, and then
 * checks the other half of the same claim — that the two browser entry points are not among
 * them. A rule that named folders would pass just as well the day someone imported `./dom`
 * from `group.ts`.
 *
 * It reads the sources rather than mocking `globalThis`, because a cast is exactly how a DOM
 * reference would sneak in past the type checker.
 */

import { describe, expect, it } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

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

/** Every relative import specifier of a module, in source order. */
function imports(code: string): readonly string[] {
  const found: string[] = [];
  const pattern = /(?:^|\n)\s*(?:import|export)[^'";]*?from\s*['"](\.[^'"]*)['"]/gu;
  let match: RegExpExecArray | null = pattern.exec(code);
  while (match !== null) {
    found.push(match[1]!);
    match = pattern.exec(code);
  }
  return found;
}

/** The `.ts` files reachable from an entry point by following relative imports. */
async function reachable(entry: string): Promise<ReadonlySet<string>> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const code = await readFile(file, 'utf8');
    for (const specifier of imports(code)) {
      // Emitted specifiers carry `.js`; the source beside them is `.ts`.
      queue.push(resolve(dirname(file), specifier.replace(/\.js$/u, '.ts')));
    }
  }
  return seen;
}

/** Every `.ts` under a directory, recursively. */
async function sources(dir: string): Promise<readonly string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await sources(full)));
    else if (entry.name.endsWith('.ts')) files.push(full);
  }
  return files;
}

describe('zero DOM', () => {
  it('names no DOM global in anything reachable from the root entry point', async () => {
    const files = await reachable(join(SRC, 'index.ts'));
    // If the walk found nothing, the test is passing for the wrong reason.
    expect(files.size).toBeGreaterThan(1);

    const offenders: string[] = [];
    for (const file of files) {
      const code = await readFile(file, 'utf8');
      for (const name of FORBIDDEN) {
        // Word boundary on both sides: `documentation` in a comment is not a hit.
        if (new RegExp(`\\b${name}\\b`).test(code)) {
          offenders.push(`${relative(SRC, file)} → ${name}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('does not reach the browser entry points', async () => {
    const files = await reachable(join(SRC, 'index.ts'));
    const browser = [...files].filter(
      (f) => relative(SRC, f).startsWith('dom') || relative(SRC, f) === 'element.ts',
    );
    expect(browser).toEqual([]);
  });

  it('accounts for every source file: model, or one of the two browser entry points', async () => {
    // Without this, a module nobody imports could hold anything at all and no rule would see
    // it — the same hole `coverage.include` closes for tests.
    const model = await reachable(join(SRC, 'index.ts'));
    const all = await sources(SRC);
    const unaccounted = all.filter((f) => {
      const rel = relative(SRC, f).replaceAll('\\', '/');
      return !model.has(f) && !rel.startsWith('dom/') && rel !== 'element.ts';
    });
    expect(unaccounted).toEqual([]);
  });
});
