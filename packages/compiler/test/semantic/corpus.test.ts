/**
 * The repository writes the portable view (SDD-61 criterion 33): no `.fud` outside
 * `experiments/` gives a code of the view's rules, SDD-51's nor SDD-61's, in the semantic pass.
 * `examples/vista-errores` is the one place that has to give them, and it is held to its comments
 * in `@fudic/typecheck`, through the build's channel and with the typed pass.
 *
 * Every tracked file is read, so a new one is in the net the moment it is committed. The typed
 * pass and the stores of the server cut need a program and a project on disk: the same net over
 * the projects is `@fudic/typecheck`'s `corpus.test.ts`.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Diagnostic } from '../../src/types/index.js';
import { viewDiagnostics } from './_view.js';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

/** The codes of the view: SDD-51's range with the template's `$` (FUD0461), and SDD-61's. */
const VIEW = /^FUD09[01]\d$|^FUD0461$|^FUD11[45]\d$/u;

const seen = (source: string, ds: readonly Diagnostic[]): readonly string[] =>
  ds.filter((d) => VIEW.test(d.code)).map((d) => `${d.code} ${source.slice(d.span.start, d.span.end)}`);

/**
 * What the `.fudapi` a file of the repo links bring into its view, read off their lines: the
 * compiler does not read a `.fudapi` (the host tells it), and this net only needs the names.
 */
function linkedApis(path: string, source: string): { readonly data: boolean; readonly names: ReadonlySet<string> } | undefined {
  const texts = [...source.matchAll(/<link rel="server" href="([^"]+)">/gu)].map((m) => readFileSync(join(dirname(path), m[1]!), 'utf8'));
  if (texts.length === 0) return undefined;
  const names = texts.flatMap((t) => [...t.matchAll(/^(?:(?:get|post|put|patch|delete|form) | {2}form )([A-Za-z_]\w*)/gmu)].map((m) => m[1]!));
  return { data: texts.some((t) => /^load\b/mu.test(t)), names: new Set(names) };
}

/** Every tracked `.fud` outside `experiments/` and `examples/vista-errores/`, from the root. */
function corpus(): readonly string[] {
  return execFileSync('git', ['ls-files', '*.fud'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((path) => path !== '' && !path.startsWith('experiments/') && !path.startsWith('examples/vista-errores/'));
}

describe('the repository writes the portable view (criterion 33)', () => {
  const all = corpus();

  it('finds the corpus', () => {
    expect(all.length).toBeGreaterThan(200);
  });

  for (const path of all) {
    it(path, () => {
      const file = join(ROOT, path);
      const source = readFileSync(file, 'utf8');
      expect(seen(source, viewDiagnostics(source, linkedApis(file, source)))).toEqual([]);
    });
  }
});
