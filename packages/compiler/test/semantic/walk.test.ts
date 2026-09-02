/**
 * The walk's `control` callback (BUG-17 §4.3).
 *
 * The walk has always descended THROUGH a control construct without handing it over, which is
 * enough for an analyzer that only cares about elements and wrong for anyone asking what a
 * given offset *is*: only the node knows where its parentheses are.
 */

import { describe, expect, it } from 'vitest';
import { parseDocument, type AtConstructParser } from '../../src/html/index.js';
import { parseControl } from '../../src/control/index.js';
import { parseCodeBlock } from '../../src/code/index.js';
import { structureDocument } from '../../src/document/index.js';
import type { HtmlContent } from '../../src/html/index.js';
import { walk, documentRoots } from '../../src/semantic/index.js';

const constructs: AtConstructParser = { parseControl, parseCodeBlock };

/** Wrap shadow content in a minimal valid component (DSD host wrapper, decision 75). */
const component = (inner: string): string =>
  `<app-test><template shadowrootmode="open">${inner}</template></app-test>`;

function roots(inner: string): readonly HtmlContent[] {
  const source = component(inner);
  const html = parseDocument(source, { atConstructs: constructs }).value;
  return documentRoots(structureDocument(source, html).value);
}

const NESTED = [
  '@if (a) { <p>i</p> }',
  '@foreach (const x of xs) key (x.id) { @while (a) key (1) { <p>w</p> } }',
  '@for (let i = 0; i < 2; i++) key (i) { <p>f</p> }',
  "@switch (a) { case 'h': <p>s</p> default: <p>d</p> }",
].join('');

describe('walk — the control callback', () => {
  it('hands over every construct, the nested one included', () => {
    const seen: string[] = [];
    walk(roots(NESTED), { control: (node) => void seen.push(node.type) });

    // Pre-order: a construct arrives before the bodies it holds, so the `@while` comes
    // straight after the `@foreach` that contains it.
    expect(seen).toEqual(['if', 'foreach', 'while', 'for', 'switch']);
  });

  it('stays optional: a visitor that does not ask still reaches the bodies', () => {
    const tags: string[] = [];
    walk(roots(NESTED), { element: (element) => void tags.push(element.name) });

    expect(tags).toEqual(['app-test', 'template', 'p', 'p', 'p', 'p', 'p']);
  });
});

describe('walk — the binding callback (BUG-23 task 7)', () => {
  /** Every attribute expression the walk hands over, as `attribute=source`. */
  function bindings(inner: string): readonly string[] {
    const source = component(inner);
    const seen: string[] = [];
    walk(roots(inner), {
      binding: (expr, attr, el) => {
        const name = typeof attr.name === 'string' ? attr.name : '(expr)';
        seen.push(`${el.name}/${name}=${source.slice(expr.span.start, expr.span.end)}`);
      },
    });
    return seen;
  }

  it('hands over every expression in a value, nested elements included', () => {
    expect(bindings('<div id="@item.id"><p .tone=@titulo class:on="@active"></p></div>')).toEqual([
      'div/id=@item.id',
      'p/.tone=@titulo',
      'p/class:on=@active',
    ]);
  });

  it('hands over both parts of a mixed value, and skips the literal runs', () => {
    expect(bindings('<div title="a @x b @y"></div>')).toEqual(['div/title=@x', 'div/title=@y']);
  });

  it('hands over the expression that NAMES a `bus:( … )`, before its value', () => {
    expect(bindings('<div bus:(EVENTOS.carrito)="@onCart"></div>')).toEqual([
      'div/(expr)=(EVENTOS.carrito)',
      'div/(expr)=@onCart',
    ]);
  });

  it('says nothing about an attribute with no expression in it', () => {
    expect(bindings('<div id="x" hidden></div>')).toEqual([]);
  });

  it('stays optional: a visitor that does not ask is not called', () => {
    const tags: string[] = [];
    walk(roots('<div id="@a"></div>'), { element: (el) => void tags.push(el.name) });

    expect(tags).toEqual(['app-test', 'template', 'div']);
  });
});
