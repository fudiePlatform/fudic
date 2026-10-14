/**
 * BUG-47 §4.1 — the imports only erased code used go with it (criteria 1 and 2).
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

describe('criterion 1: an import only the erased code used', () => {
  it('goes whole when it is left without specifiers', () => {
    const code = [
      "import { middleware } from '@fudic/http';",
      "import { Tokens } from '../services/tokens';",
      'export const auth = middleware().server((ctx) => new Tokens().verify(ctx));',
    ].join('\n');
    const out = orphaned(code, '(ctx) => new Tokens().verify(ctx)');
    expect(out).not.toContain('tokens');
    expect(out).toContain("import { middleware } from '@fudic/http';");
  });

  it('follows the LOCAL name of a renamed specifier', () => {
    const code = ["import { Tokens as T } from './tokens';", 'run(BODY(T));'].join('\n');
    expect(orphaned(code, 'BODY(T)')).toBe('\nrun(BODY(T));');
  });

  it('a default and a namespace import go the same way', () => {
    const code = ["import db from './db';", "import * as env from './env';", 'run(BODY(db, env, db));'].join('\n');
    expect(orphaned(code, 'BODY(db, env, db)')).toBe('\n\nrun(BODY(db, env, db));');
  });

  it('a name used in two erased spans is still only theirs', () => {
    const code = ["import { secret } from './s';", 'a(ONE(secret));', 'b(TWO(secret));'].join('\n');
    expect(orphaned(code, 'ONE(secret)', 'TWO(secret)')).toBe('\na(ONE(secret));\nb(TWO(secret));');
  });
});

describe('criterion 2: what the rest of the module uses stays', () => {
  it('a name also used outside the erased spans keeps its import', () => {
    const code = ["import { Tokens } from './tokens';", 'run(BODY(Tokens));', 'export { Tokens };'].join('\n');
    expect(orphaned(code, 'BODY(Tokens)')).toBe(code);
  });

  it('an orphan specifier goes and the rest of the declaration stays', () => {
    const code = ["import { a, b as c, d } from './x';", 'run(BODY(c), a, d);'].join('\n');
    expect(orphaned(code, 'BODY(c)')).toBe("import { a, d } from './x';\nrun(BODY(c), a, d);");
  });

  it('a default kept, its named siblings gone: no empty braces', () => {
    const code = ["import def, { only } from './x';", 'run(BODY(only), def);'].join('\n');
    expect(orphaned(code, 'BODY(only)')).toBe("import def from './x';\nrun(BODY(only), def);");
  });

  it('a default orphaned, a named sibling kept', () => {
    const code = ["import def, { kept } from './x';", 'run(BODY(def), kept);'].join('\n');
    expect(orphaned(code, 'BODY(def)')).toBe("import { kept } from './x';\nrun(BODY(def), kept);");
  });

  it('the source and its import attributes are kept as written', () => {
    const code = ['import { a, b } from "./data.json" with { type: "json" };', 'run(BODY(a), b);'].join('\n');
    expect(orphaned(code, 'BODY(a)')).toBe('import { b } from "./data.json" with { type: "json" };\nrun(BODY(a), b);');
  });

  it("import './x' stays: it is an effect the author asked for", () => {
    const code = ["import './polyfill';", "import { a } from './a';", 'run(BODY(a));'].join('\n');
    expect(orphaned(code, 'BODY(a)')).toBe("import './polyfill';\n\nrun(BODY(a));");
  });

  it('an import that was already unused is the author’s, and stays', () => {
    const code = ["import { unused } from './u';", "import { a } from './a';", 'run(BODY(a));'].join('\n');
    expect(orphaned(code, 'BODY(a)')).toBe("import { unused } from './u';\n\nrun(BODY(a));");
  });

  it('nothing erased: nothing to replace', () => {
    const code = ["import { a } from './a';", 'run(a);'].join('\n');
    expect(orphaned(code)).toBe(code);
  });
});

describe('applyReplacements', () => {
  it('applies them whatever their order, each on the original offsets', () => {
    const code = 'abcdef';
    const out = applyReplacements(code, [
      { start: 0, end: 1, text: 'X' },
      { start: 4, end: 6, text: 'YZW' },
      { start: 2, end: 3, text: '' },
    ]);
    expect(out).toBe('XbdYZW');
  });
});
