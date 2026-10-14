/**
 * BUG-47 §4.1 — the imports only erased code used go with it (criteria 1 and 2), blanked and
 * never cut (criterion 13).
 *
 * Driven with a real Oxc parse, as the erasers call it, and with the erased spans marked by
 * hand: what is under test is which specifiers go, not how a span is found.
 */

import { describe, expect, it } from 'vitest';
import { JsBatch, type OxcNode } from '@fudic/compiler';
import { applyReplacements, orphanImports, type Span } from '../src/orphan-imports.js';

/** The span of the first occurrence of `text` in `code`. */
function spanOf(code: string, text: string): Span {
  const start = code.indexOf(text);
  if (start < 0) throw new Error(`${text} not in the code`);
  return { start, end: start + text.length };
}

/** `code` with the imports orphaned by erasing each of `erased` (the spans themselves untouched). */
function orphaned(code: string, ...erased: string[]): string {
  const batch = new JsBatch(code);
  const id = batch.add('module-statements', { start: 0, end: code.length });
  const parsed = batch.parse();
  const statements = parsed.value.ast(id) as OxcNode[];
  const spans = erased.map((text) => spanOf(code, text));
  return applyReplacements(code, orphanImports(code, statements, spans, parsed.value.mapOffset));
}

/**
 * `code` with `from` replaced by `to` the way §4.2 says a replacement lands: `to`, then the
 * rest of `from` blanked — spaces, its line breaks kept — so nothing after it moves.
 */
function swap(code: string, from: string, to: string): string {
  return code.replace(from, to + from.slice(to.length).replace(/[^\r\n]/gu, ' '));
}

describe('criterion 1: an import only the erased code used', () => {
  it('goes whole when it is left without specifiers', () => {
    const code = [
      "import { middleware } from '@fudic/http';",
      "import { Tokens } from '../services/tokens';",
      'export const auth = middleware().server((ctx) => new Tokens().verify(ctx));',
    ].join('\n');
    expect(orphaned(code, '(ctx) => new Tokens().verify(ctx)')).toBe(
      swap(code, "import { Tokens } from '../services/tokens';", ''),
    );
  });

  it('follows the LOCAL name of a renamed specifier', () => {
    const code = ["import { Tokens as T } from './tokens';", 'run(BODY(T));'].join('\n');
    expect(orphaned(code, 'BODY(T)')).toBe(swap(code, "import { Tokens as T } from './tokens';", ''));
  });

  it('a default and a namespace import go the same way', () => {
    const code = ["import db from './db';", "import * as env from './env';", 'run(BODY(db, env, db));'].join('\n');
    expect(orphaned(code, 'BODY(db, env, db)')).toBe(
      swap(swap(code, "import db from './db';", ''), "import * as env from './env';", ''),
    );
  });

  it('a name used in two erased spans is still only theirs', () => {
    const code = ["import { secret } from './s';", 'a(ONE(secret));', 'b(TWO(secret));'].join('\n');
    expect(orphaned(code, 'ONE(secret)', 'TWO(secret)')).toBe(swap(code, "import { secret } from './s';", ''));
  });
});

describe('criterion 2: what the rest of the module uses stays', () => {
  it('a name also used outside the erased spans keeps its import', () => {
    const code = ["import { Tokens } from './tokens';", 'run(BODY(Tokens));', 'export { Tokens };'].join('\n');
    expect(orphaned(code, 'BODY(Tokens)')).toBe(code);
  });

  it('an orphan specifier goes and the rest of the declaration stays', () => {
    const code = ["import { a, b as c, d } from './x';", 'run(BODY(c), a, d);'].join('\n');
    expect(orphaned(code, 'BODY(c)')).toBe(swap(code, "import { a, b as c, d } from './x';", "import { a, d } from './x';"));
  });

  it('a default kept, its named siblings gone: no empty braces', () => {
    const code = ["import def, { only } from './x';", 'run(BODY(only), def);'].join('\n');
    expect(orphaned(code, 'BODY(only)')).toBe(swap(code, "import def, { only } from './x';", "import def from './x';"));
  });

  it('a default orphaned, a named sibling kept', () => {
    const code = ["import def, { kept } from './x';", 'run(BODY(def), kept);'].join('\n');
    expect(orphaned(code, 'BODY(def)')).toBe(swap(code, "import def, { kept } from './x';", "import { kept } from './x';"));
  });

  it('the source and its import attributes are kept as written', () => {
    const declaration = 'import { a, b } from "./data.json" with { type: "json" };';
    const code = [declaration, 'run(BODY(a), b);'].join('\n');
    expect(orphaned(code, 'BODY(a)')).toBe(swap(code, declaration, 'import { b } from "./data.json" with { type: "json" };'));
  });

  it('criterion 9: only inline types left becomes `import type`, so the module is not loaded', () => {
    // Under `verbatimModuleSyntax`, `import { type User } from 'x'` is kept as `import 'x'`.
    const declaration = "import { Tokens, type User } from '../services/tokens';";
    const code = [declaration, 'run(BODY(Tokens));', 'let u: User;'].join('\n');
    expect(orphaned(code, 'BODY(Tokens)')).toBe(swap(code, declaration, "import type { User } from '../services/tokens';"));
  });

  it('a renamed inline type keeps its alias in the `import type`', () => {
    const declaration = "import { a, type B as C, type D } from './x' with { type: 'json' };";
    const code = [declaration, 'run(BODY(a));', 'let c: C, d: D;'].join('\n');
    expect(orphaned(code, 'BODY(a)')).toBe(swap(code, declaration, "import type { B as C, D } from './x' with { type: 'json' };"));
  });

  it('a value left beside the inline type: a plain import, the `type` kept inline', () => {
    const declaration = "import { a, b, type T } from './x';";
    const code = [declaration, 'run(BODY(a), b);', 'let t: T;'].join('\n');
    expect(orphaned(code, 'BODY(a)')).toBe(swap(code, declaration, "import { b, type T } from './x';"));
  });

  it("import './x' stays: it is an effect the author asked for", () => {
    const code = ["import './polyfill';", "import { a } from './a';", 'run(BODY(a));'].join('\n');
    expect(orphaned(code, 'BODY(a)')).toBe(swap(code, "import { a } from './a';", ''));
  });

  it('an import that was already unused is the author’s, and stays', () => {
    const code = ["import { unused } from './u';", "import { a } from './a';", 'run(BODY(a));'].join('\n');
    expect(orphaned(code, 'BODY(a)')).toBe(swap(code, "import { a } from './a';", ''));
  });

  it('nothing erased: nothing to replace', () => {
    const code = ["import { a } from './a';", 'run(a);'].join('\n');
    expect(orphaned(code)).toBe(code);
  });
});

describe('criterion 13: applyReplacements blanks, it never cuts', () => {
  it('a shorter replacement: the rest of the span is spaces, and nothing after it moves', () => {
    expect(applyReplacements('abcdef', [{ start: 1, end: 4, text: 'X' }])).toBe('aX  ef');
  });

  it('the line breaks of the span are kept, so what follows keeps its line and its column', () => {
    const code = 'a(secret,\n  more,\n  most) + after;\nnext;';
    const start = code.indexOf('secret');
    const out = applyReplacements(code, [{ start, end: code.indexOf(')'), text: 'u' }]);
    expect(out).toBe(`a(u${' '.repeat(6)}\n${' '.repeat(7)}\n${' '.repeat(6)}) + after;\nnext;`);
    const at = (text: string, word: string): [number, number] => {
      const lines = text.split('\n');
      const line = lines.findIndex((l) => l.includes(word));
      return [line, lines[line]!.indexOf(word)];
    };
    expect(at(out, 'after')).toEqual(at(code, 'after'));
    expect(at(out, 'next')).toEqual(at(code, 'next'));
  });

  it('a replacement that starts on a break moves the break after itself: lines still kept', () => {
    const code = 'a(\n  secret\n);';
    const out = applyReplacements(code, [{ start: 2, end: code.indexOf(')') - 1, text: 'u' }]);
    expect(out).toBe('a(u\n        \n);');
    expect(out.split('\n')).toHaveLength(code.split('\n').length);
  });

  it('CRLF breaks are kept as they were', () => {
    const code = 'f(x\r\ny);z';
    expect(applyReplacements(code, [{ start: 2, end: 6, text: '' }])).toBe('f( \r\n );z');
  });

  it('a longer replacement keeps the breaks of the span: only columns on its own line move', () => {
    const code = 'f(a\nb);\nnext;';
    const out = applyReplacements(code, [{ start: 2, end: 5, text: 'undefined' }]);
    expect(out).toBe('f(undefined\n);\nnext;');
    expect(out.split('\n').slice(1)).toEqual(code.split('\n').slice(1).map((l, i) => (i === 0 ? ');' : l)));
  });

  it('applies them whatever their order, each on the original offsets', () => {
    const out = applyReplacements('abcdef', [
      { start: 0, end: 1, text: 'X' },
      { start: 4, end: 6, text: 'YZ' },
      { start: 2, end: 3, text: '' },
    ]);
    expect(out).toBe('Xb dYZ');
  });
});
