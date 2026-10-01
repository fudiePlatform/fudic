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

describe('every .md has the shape of §4.4 (criterion 3)', () => {
  for (const code of md) {
    it(code, () => {
      const lines = read(`${code}.md`).replace(/\r\n/gu, '\n').trimEnd().split('\n');
      expect(lines[0]).toMatch(new RegExp(`^# ${code} — \\S`, 'u'));
      expect(lines[2]).toBe('');

      const status = /^\*\*(error|warning|info|hint|retired)\*\* · (SDD|BUG)-\d+/u.exec(lines[1]!);
      expect(status, `${code}: second line`).not.toBeNull();
      const body = lines.slice(3);

      if (status![1] === 'retired') {
        // A retired code cannot be emitted: it has no function to call.
        expect(ts).not.toContain(code);
        expect(body.some((l) => l.startsWith('**Replaced by:**'))).toBe(true);
      } else {
        expect(ts).toContain(code);
        expect(body.some((l) => l.startsWith('**Fix:**'))).toBe(true);
        expect(severitiesOf(code)).toEqual(new Set([status![1]]));
      }
    });
  }
});
