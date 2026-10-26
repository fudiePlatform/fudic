/**
 * `examples/vista-errores`, case by case (SDD-51 criterion 22, SDD-61 criterion 32).
 *
 * The example IS the specification of what the view may not write: every case carries, in the
 * comment above it, the code it gives and what it underlines — «FUD0900 sobre `n++`» — or «sin
 * diagnóstico». In the markup that comment is Razor (`@* … *@`); in the `@code` and in a `.ts`
 * module, where the server cut reports, it is a run of `//` lines. This test reads those comments
 * and holds every file of the example to them: between one comment and the next, exactly the
 * diagnostics the first one announces, and nothing else. A case that stops firing, fires twice or
 * underlines something else fails here by its name, and a new case is a new comment — never a new
 * line in this file.
 *
 * Through the project checker, the channel the build reports by (SDD-35), with the semantic pass
 * and the typed pass of the portable view: what this test sees is what the author sees. The
 * TypeScript errors are another layer and are not commented.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { createProjectChecker, toPosix, type CheckReport } from '../src/index.js';

const DIR = fileURLToPath(new URL('../../../examples/vista-errores/', import.meta.url));
const FILES = ['vista-errores.fud', 'snippets.fud', 'app-pieza.fud', 'util.ts'] as const;

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

/** The comments of a source, in order: Razor blocks and runs of `//` lines. */
function comments(source: string): readonly { readonly index: number; readonly end: number; readonly text: string }[] {
  const razor = [...source.matchAll(/@\*([\s\S]*?)\*@/gu)].map((m) => ({ index: m.index, end: m.index + m[0].length, text: m[1]! }));
  const lines = [...source.matchAll(/(?:^[ \t]*\/\/.*(?:\r?\n|$))+/gmu)].map((m) => ({
    index: m.index,
    end: m.index + m[0].length,
    text: m[0].replace(/^[ \t]*\/\//gmu, ''),
  }));
  return [...razor, ...lines].sort((a, b) => a.index - b.index);
}

/** The cases of a source: each comment, from its end to the start of the next one. */
function cases(source: string): readonly Case[] {
  const all = comments(source);
  return all.map((comment, i) => {
    const line = source.slice(0, comment.index).split('\n').length;
    const title = `${line}: ${comment.text.replace(/\s+/gu, ' ').trim().slice(0, 70)}`;
    const to = all[i + 1]?.index ?? source.length;
    return { title, expected: announced(comment.text), from: comment.end, to };
  });
}

let report: CheckReport;

beforeAll(() => {
  report = createProjectChecker({ root: DIR, portableView: true }).check();
});

function check(name: string): void {
  const source = readFileSync(DIR + name, 'utf8');
  const path = toPosix(DIR + name);
  const found = (from: number, to: number): readonly string[] =>
    report.problems
      .filter((p) => toPosix(p.file) === path && p.code.startsWith('FUD') && p.span.start >= from && p.span.start < to)
      .map((p) => `${p.code} ${source.slice(p.span.start, p.span.end)}`)
      .sort();
  const all = cases(source);

  it('says nothing before its first case', () => {
    expect(found(0, all[0]?.from ?? source.length)).toEqual([]);
  });
  for (const each of all) {
    it(each.title, () => {
      expect(found(each.from, each.to)).toEqual(each.expected);
    });
  }
}

for (const name of FILES) describe(`examples/vista-errores/${name}`, () => check(name));

describe('the comment grammar the cases are written in', () => {
  it('reads several tokens, two codes, a count, and nothing where nothing is announced', () => {
    expect(announced('FUD0907 sobre `a`, `b` y `c`: why.')).toEqual(['FUD0907 a', 'FUD0907 b', 'FUD0907 c']);
    expect(announced('FUD0909 sobre `x`, y FUD0900 sobre `y++`.')).toEqual(['FUD0900 y++', 'FUD0909 x']);
    expect(announced('FUD0908 sobre `var` (×2): it leaks.')).toEqual(['FUD0908 var', 'FUD0908 var']);
    expect(announced('Sin diagnóstico: `x` is fine.')).toEqual([]);
  });

  it('reads a run of `//` lines as one comment, also across the line break', () => {
    const source = '@code {\n  // FUD1150 sobre\n  // `x`: why.\n  const x = 1;\n}\n@* FUD0907 sobre `y`. *@\n<p>@y</p>\n';
    const all = cases(source);
    expect(all.map((c) => c.expected)).toEqual([['FUD1150 x'], ['FUD0907 y']]);
    expect(source.slice(all[0]!.from, all[0]!.to)).toBe('  const x = 1;\n}\n');
  });
});
