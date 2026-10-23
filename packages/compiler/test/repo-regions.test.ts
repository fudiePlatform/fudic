/**
 * SDD-60 criteria 25 and 34, on whole documents: a region in the `@code` is `FUD1110`, once per
 * region, and no `.fud` of the repository outside `experiments/` has one left.
 *
 * `code/code.test.ts` covers the marker scanner on a bare `@code`. Here the document goes through
 * the same parse and structure the emit uses, so a diagnostic the scanner gives and a later stage
 * drops, or duplicates, shows up.
 *
 * The search of the repository is done twice: as text, with the escaped `@@server` of a page that
 * talks about the old model left out, and as the compiler reads it, because a marker the text
 * search misses (a line break before the brace) is still a region.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { atConstructs, parseDocument, structureDocument } from '../src/index.js';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** Every diagnostic code of the parse and the structure of `source`, in order. */
function codesOf(source: string): readonly string[] {
  const parsed = parseDocument(source, { atConstructs });
  const structured = structureDocument(source, parsed.value);
  return [...parsed.diagnostics, ...structured.diagnostics].map((d) => d.code);
}

/** Every tracked `.fud` outside `experiments/`, by its path from the root. */
function files(): readonly string[] {
  return execFileSync('git', ['ls-files', '*.fud'], { cwd: repo, encoding: 'utf8' })
    .split('\n')
    .filter((f) => f !== '' && !f.startsWith('experiments/'))
    .sort();
}

/** A region marker as text: `@server` or `@client` followed by `{` or `(`, not escaped `@@`. */
const REGION = /(?<!@)@(?:server|client)\s*[({]/u;

const route = (code: string): string =>
  `<link rel="layout" href="./_layout.fud">\n\n@code {\n${code}\n}\n\n<p>x</p>\n`;

describe('a region in a whole document (criterion 25)', () => {
  it('gives FUD1110 once for a @server region and nothing else', () => {
    expect(codesOf(route('  @server {\n    const a = 1;\n  }'))).toEqual(['FUD1110']);
  });

  it('gives FUD1110 once for a @client region and nothing else', () => {
    expect(codesOf(route('  @client {\n    const b = 2;\n  }'))).toEqual(['FUD1110']);
  });

  it('gives one per region when both are there', () => {
    expect(codesOf(route('  @server { const a = 1; }\n  @client { const b = 2; }'))).toEqual([
      'FUD1110',
      'FUD1110',
    ]);
  });

  it('gives nothing for the same code without the wrappers', () => {
    expect(codesOf(route('  const a = 1;\n  const b = 2;'))).toEqual([]);
  });
});

describe('the repository has no regions left (criterion 34)', () => {
  const all = files();

  it('finds the .fud files of the repository', () => {
    expect(all.length).toBeGreaterThan(50);
  });

  it('has no @server or @client marker in the text of any .fud', () => {
    const hits = all.filter((f) => REGION.test(readFileSync(join(repo, f), 'utf8')));
    expect(hits).toEqual([]);
  });

  it('has no .fud the compiler reads a region in', () => {
    const hits = all.filter((f) => codesOf(readFileSync(join(repo, f), 'utf8')).includes('FUD1110'));
    expect(hits).toEqual([]);
  });

  it('the text search sees a region, and passes over an escaped one', () => {
    expect(REGION.test('@code { @server { } }')).toBe(true);
    expect(REGION.test('@code { @client(x) { } }')).toBe(true);
    expect(REGION.test('<code>@@server load</code>')).toBe(false);
  });
});
