/**
 * `examples/vista-errores`, case by case, through the semantic pass alone (SDD-61 criterion 32).
 *
 * The example announces, in the comment above each case, every code it gives: Razor comments in
 * the markup, runs of `//` lines in the `@code`. `@fudic/typecheck` holds it to all of them through
 * the build's channel; this test holds the compiler to the codes only the compiler gives, so a rule
 * of the view that stops firing fails here, beside its code. `FUD1140` is left out, since the typed
 * pass gives it too, and so are the typed pass's own codes.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { viewDiagnostics } from './_view.js';

const EXAMPLE = fileURLToPath(new URL('../../../../examples/vista-errores/', import.meta.url));

/** The codes only the semantic pass gives (`FUD1149` is the structure's, read with the document). */
const OWN = /^FUD09[01]\d$|^FUD0461$|^FUD114[1-8]$|^FUD1150$/u;

/** What a comment announces: every «FUDnnnn sobre `a`, `b` y `c`», `(×N)` for a repeated one. */
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
  return out;
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

describe('examples/vista-errores, the compiler’s codes (criterion 32)', () => {
  for (const name of ['vista-errores.fud', 'snippets.fud']) {
    const source = readFileSync(join(EXAMPLE, name), 'utf8');
    const found = viewDiagnostics(source)
      .filter((d) => OWN.test(d.code))
      .map((d) => ({ at: d.span.start, text: `${d.code} ${source.slice(d.span.start, d.span.end)}` }));
    const all = comments(source);
    all.forEach((comment, i) => {
      const to = all[i + 1]?.index ?? source.length;
      const line = source.slice(0, comment.index).split('\n').length;
      it(`${name}:${line}`, () => {
        const inside = found.filter((d) => d.at >= comment.end && d.at < to).map((d) => d.text);
        const expected = announced(comment.text).filter((e) => OWN.test(e.split(' ')[0]!));
        expect([...inside].sort()).toEqual([...expected].sort());
      });
    });
  }
});
