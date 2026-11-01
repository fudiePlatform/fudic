/**
 * SDD-71 §8.2, 5 — the names a `@code` brings into the view, and how the parser uses them to
 * read `@x | name` with blanks around the bar.
 */

import { describe, expect, it } from 'vitest';
import { codeNames, type CodeBlockNode } from '../../src/code/index.js';
import { atConstructs } from '../../src/constructs.js';
import { parseDocument, type HtmlContent } from '../../src/html/index.js';

function names(body: string): string[] {
  const source = `@code {\n${body}\n}\n`;
  const doc = parseDocument(source, { atConstructs }).value;
  const block = doc.children.find((c) => c.type === 'code') as CodeBlockNode;
  return [...codeNames(source, block)].sort();
}

/** The source of every expression of `source`'s top level, in order. */
function expressions(source: string): string[] {
  const doc = parseDocument(source, { atConstructs }).value;
  const walk = (nodes: readonly HtmlContent[]): string[] =>
    nodes.flatMap((n) => {
      if (n.type === 'razor-expression') return [source.slice(n.expr.start, n.expr.end)];
      return n.type === 'element' ? walk(n.children) : [];
    });
  return walk(doc.children);
}

describe('codeNames', () => {
  it('reads what the block declares', () => {
    expect(names('const a = 1; let b; var c; function d() {} function* e() {} class F {}')).toEqual([
      'F', 'a', 'b', 'c', 'd', 'e',
    ]);
  });

  it('reads destructuring, leaving out the keys it renames', () => {
    expect(names('const { a, b: c, ...d } = x;\nconst [e, f] = y;')).toEqual(['a', 'c', 'd', 'e', 'f']);
  });

  it('reads every kind of import, leaving out the names `as` renames and `type`', () => {
    expect(
      names("import a, { b as c, type d } from 'm';\nimport * as ns from 'n';\nimport{e}from 'o';"),
    ).toEqual(['a', 'c', 'd', 'e', 'ns']);
  });

  it('never takes a name from a string, a template, a comment or a nested `${…}`', () => {
    expect(names("const s = 'const a = 1'; // let b\nconst t = `${'const c'} ${x}`; /* var d */")).toEqual([
      's', 't',
    ]);
  });

  it('is empty for a block that declares nothing', () => {
    expect(names("console.log('hi');")).toEqual([]);
  });
});

describe('the parser reads `@x | name` with the names of the @code', () => {
  const CODE = "@code {\n  import iniciales from '../pipes/iniciales';\n  const corto = truncar({ max: 3 });\n}\n";

  it('a pipe the @code imports or declares joins the expression, any number of blanks away', () => {
    expect(expressions(`${CODE}<p>@autor |    iniciales</p><p>@resumen | corto | iniciales</p>`)).toEqual([
      'autor |    iniciales',
      'resumen | corto | iniciales',
    ]);
  });

  it('any other name leaves the bar as text, as it always was', () => {
    expect(expressions(`${CODE}<p>@precio | Envío</p>`)).toEqual(['precio']);
  });

  it('a @code written after the view is read before deciding: the parse runs once more', () => {
    expect(expressions(`<p>@autor | iniciales</p><p>@x | otro</p>\n${CODE}`)).toEqual([
      'autor | iniciales',
      'x',
    ]);
  });

  it('without the names seam, the bar with blanks is text', () => {
    const { codeNames: _, ...withoutNames } = atConstructs;
    const doc = parseDocument(`${CODE}<p>@autor | iniciales</p>`, { atConstructs: withoutNames }).value;
    const p = doc.children.find((c) => c.type === 'element');
    expect(p?.type === 'element' && p.children[0]?.type === 'razor-expression' && p.children[0].expr.end -
      p.children[0].expr.start).toBe('autor'.length);
  });

  it('in an attribute value the bar with blanks stays text', () => {
    const source = `${CODE}<p title="@autor | iniciales"></p>`;
    const doc = parseDocument(source, { atConstructs }).value;
    const p = doc.children.find((c) => c.type === 'element');
    const parts = p?.type === 'element' ? p.attributes[0]?.value ?? [] : [];
    const first = parts[0];
    expect(first?.type === 'razor-expression' && source.slice(first.expr.start, first.expr.end)).toBe('autor');
  });
});
