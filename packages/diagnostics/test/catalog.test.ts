/**
 * SDD-50 criteria 2 and 3: the folder `codes/` IS the catalogue, so it is read as one.
 *
 * Every live code is a `.ts`, a `.md` and a line of `index.ts`; every retired one is only a
 * `.md` that says so. The sweep reads the disk and not the module graph, because what it
 * guards against is a file that nothing imports.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const CODES = new URL('../src/codes/', import.meta.url);
const files = readdirSync(CODES);
const named = (ext: string): string[] =>
  files
    .filter((f) => f.endsWith(ext))
    .map((f) => f.slice(0, -ext.length))
    .sort();

const ts = named('.ts');
const md = named('.md');
const read = (name: string): string => readFileSync(new URL(name, CODES), 'utf8');

/** The codes `index.ts` re-exports, in the order it writes them. */
const indexed = [...readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8').matchAll(
  /^export \* from '\.\/codes\/(FUD\d{4})\.js';$/gmu,
)].map((m) => m[1]!);

/** The severity a `.ts` passes to its constructor: once per call, so FUD0761 says it twice. */
function severitiesOf(code: string): Set<string> {
  const calls = read(`${code}.ts`).matchAll(/'(FUD\d{4})',\s*'(error|warning|info|hint)'/gu);
  return new Set([...calls].map((m) => (m[1] === code ? m[2]! : `foreign ${m[1]}`)));
}

describe('the folder is the catalogue (criterion 2)', () => {
  it('holds only FUDnnnn.ts and FUDnnnn.md', () => {
    expect(files.filter((f) => !/^FUD\d{4}\.(ts|md)$/u.test(f))).toEqual([]);
  });

  it('has a .md for every .ts', () => {
    expect(ts.filter((code) => !md.includes(code))).toEqual([]);
  });

  it('re-exports every .ts from index.ts, and nothing that is not one', () => {
    expect([...indexed].sort()).toEqual(ts);
  });

  it('writes index.ts in numeric order, once per code', () => {
    expect(indexed).toEqual([...new Set(indexed)].sort());
  });
});

/** A JSDoc block (`/** … *\/`) anywhere in a source. */
const JSDOC = /\/\*\*[\s\S]*?\*\//gu;

/** The internal documents a maintainer reads; a reader of the `.md` never does. */
const ORIGIN = /\b(SDD|BUG)-\d+/u;

describe('every .md has the closed shape (SDD-62 §3.1, criterion 1)', () => {
  for (const code of md) {
    it(code, () => {
      const text = read(`${code}.md`);
      const lines = text.replace(/\r\n/gu, '\n').trimEnd().split('\n');
      expect(lines[0]).toMatch(new RegExp(`^# ${code} — \\S`, 'u'));
      expect(lines[2]).toBe('');

      // The severity alone: the origin stays in the .ts.
      const status = /^\*\*(error|warning|info|hint|retired)\*\*$/u.exec(lines[1]!);
      expect(status, `${code}: second line is ${JSON.stringify(lines[1])}`).not.toBeNull();
      expect(text, `${code}: names an internal document`).not.toMatch(/SDD-|BUG-/u);

      // At least one line of why, with no headings, and the closing line last: nothing after it.
      const body = lines.slice(3, -1);
      const last = lines.at(-1)!;
      expect(body.length, `${code}: no why`).toBeGreaterThan(0);
      expect(body.filter((l) => l.trim() === '' || l.startsWith('#')), `${code}: why`).toEqual([]);

      if (status![1] === 'retired') {
        // A retired code cannot be emitted: it has no function to call.
        expect(ts).not.toContain(code);
        expect(last, `${code}: last line`).toMatch(/^\*\*Replaced by:\*\* \S/u);
        expect(body.filter((l) => /^\*\*(Fix|Replaced by):\*\*/u.test(l))).toEqual([]);
      } else {
        expect(ts).toContain(code);
        expect(last, `${code}: last line`).toMatch(/^\*\*Fix:\*\* \S/u);
        expect(body.filter((l) => /^\*\*(Fix|Replaced by):\*\*/u.test(l))).toEqual([]);
        expect(severitiesOf(code)).toEqual(new Set([status![1]]));
      }
    });
  }
});

describe('every .ts names its origin in its JSDoc (criterion 2)', () => {
  for (const code of ts) {
    it(code, () => {
      const docs = read(`${code}.ts`).match(JSDOC) ?? [];
      expect(docs.some((d) => ORIGIN.test(d)), `${code}: no SDD-nn or BUG-nn in a JSDoc`).toBe(true);
    });
  }
});
