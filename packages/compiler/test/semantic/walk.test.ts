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
