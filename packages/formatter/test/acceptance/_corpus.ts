/**
 * The corpus of §6, and the two things every acceptance test does with it.
 *
 * The files are this package's own copies, as `language-server` and `vscode` keep theirs: a
 * package that reads another one's fixtures is a package whose tests break when somebody
 * else edits a file for their own reasons.
 *
 * Three groups, all of them real: the canonical fixtures the compiler is tested against, the
 * four the language server runs on, and the pages of the runnable example — the "real Fudie
 * pages" of §6. Plus a set of deliberately broken files, which are the only invented ones,
 * because nobody writes those on purpose.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, type FormatResult } from '../../src/index.js';

export const fixturesDir = fileURLToPath(new URL('../../fixtures/', import.meta.url));

/** One file of the corpus. */
export interface Fixture {
  /** Path relative to `fixtures/`, POSIX style: the name a failure is reported under. */
  readonly name: string;
  readonly path: string;
  readonly source: string;
}

function walk(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith('.fud')) out.push(full);
  }
  return out;
}

function load(...groups: readonly string[]): readonly Fixture[] {
  return groups
    .flatMap((group) => walk(join(fixturesDir, group), []))
    .map((path) => ({
      name: relative(fixturesDir, path).split('\\').join('/'),
      path,
      source: readFileSync(path, 'utf8'),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Every well-formed file of the corpus. */
export const corpus = load('canonical', 'lsp', 'app', 'own');

/** Every file that does not parse. */
export const broken = load('broken');

/** Format, and fail loudly if the corpus stopped being formattable. */
export async function formatted(fixture: Fixture): Promise<string> {
  const result = await format(fixture.source);
  if (!result.ok) {
    throw new Error(`${fixture.name} was refused: ${JSON.stringify(result.diagnostics)}`);
  }
  return result.text;
}

/** Format without asserting anything about the outcome. */
export function attempt(fixture: Fixture): Promise<FormatResult> {
  return format(fixture.source);
}
