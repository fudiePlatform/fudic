/**
 * `examples/vista-errores`, case by case (SDD-51 criterion 22).
 *
 * The example IS the specification of what the view may not write: every case carries, in the
 * Razor comment above it, the code it gives and what it underlines — «FUD0900 sobre `n++`» —
 * or «sin diagnóstico». This test reads those comments and holds the file to them: between one
 * comment and the next, exactly the diagnostics the first one announces, and nothing else. A
 * case that stops firing, fires twice or underlines something else fails here by its name, and
 * a new case is a new comment — never a new line in this file.
 *
 * Through `fudicDiagnostics`, the same channel the editor and the build report (SDD-35): what
 * this test sees is what the author sees.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fudicDiagnostics } from '../src/index.js';
import { projected } from './_support.js';

const DIR = new URL('../../../examples/vista-errores/', import.meta.url);
const read = (name: string): string => readFileSync(new URL(name, DIR), 'utf8');

/** One comment and the stretch of source it speaks for: up to the next comment. */
interface Case {
  readonly title: string;
  readonly expected: readonly string[];
  readonly from: number;
  readonly to: number;
}

/**
 * What a comment announces: every «FUDnnnn sobre `a`, `b` y `c`», with `(×N)` for a token
 * that fires N times. A comment that announces nothing expects nothing.
 */
function announced(comment: string): readonly string[] {
  const text = comment.replace(/\s+/gu, ' ');
  const out: string[] = [];
  for (const match of text.matchAll(/(FUD\d{4}) sobre /gu)) {
    let rest = text.slice(match.index + match[0].length);
    for (;;) {
      const token = /^`([^`]+)`(?: \(×(\d+)\))?/u.exec(rest);
      if (token === null) break;
      for (let i = 0; i < Number(token[2] ?? 1); i++) out.push(`${match[1]} ${token[1]}`);
      rest = rest.slice(token[0].length);
      const separator = /^(?:, | y )/u.exec(rest);
      if (separator === null) break;
      rest = rest.slice(separator[0].length);
    }
  }
  return out.sort();
}

/** The cases of a source: each comment, from its end to the start of the next one. */
function cases(source: string): readonly Case[] {
  const comments = [...source.matchAll(/@\*([\s\S]*?)\*@/gu)];
  return comments.map((comment, i) => {
    const line = source.slice(0, comment.index).split('\n').length;
    const title = `${line}: ${comment[1]!.replace(/\s+/gu, ' ').trim().slice(0, 70)}`;
    const from = comment.index + comment[0].length;
    const to = comments[i + 1]?.index ?? source.length;
    return { title, expected: announced(comment[1]!), from, to };
  });
}

function check(name: string): void {
  const files = { '/p/snippets.fud': read('snippets.fud'), '/p/app-pieza.fud': read('app-pieza.fud') };
  const source = read(name);
  const { index, document } = projected(`/p/${name}`, source, { ...files, [`/p/${name}`]: source });
  const diagnostics = fudicDiagnostics(document, index);
  const found = (from: number, to: number): readonly string[] =>
    diagnostics
      .filter((d) => d.span.start >= from && d.span.start < to)
      .map((d) => `${d.code} ${source.slice(d.span.start, d.span.end)}`)
      .sort();
  const all = cases(source);

  it('says nothing before its first case', () => {
    expect(found(0, all[0]!.from)).toEqual([]);
  });
  for (const each of all) {
    it(each.title, () => {
      expect(found(each.from, each.to)).toEqual(each.expected);
    });
  }
}

describe('examples/vista-errores/vista-errores.fud', () => check('vista-errores.fud'));
describe('examples/vista-errores/snippets.fud', () => check('snippets.fud'));

describe('the comment grammar the cases are written in', () => {
  it('reads several tokens, two codes, a count, and nothing where nothing is announced', () => {
    expect(announced('FUD0907 sobre `a`, `b` y `c`: why.')).toEqual(['FUD0907 a', 'FUD0907 b', 'FUD0907 c']);
    expect(announced('FUD0909 sobre `x`, y FUD0900 sobre `y++`.')).toEqual(['FUD0900 y++', 'FUD0909 x']);
    expect(announced('FUD0908 sobre `var` (×2): it leaks.')).toEqual(['FUD0908 var', 'FUD0908 var']);
    expect(announced('Sin diagnóstico: `x` is fine.')).toEqual([]);
  });
});
