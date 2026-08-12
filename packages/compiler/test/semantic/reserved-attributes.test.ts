/**
 * `FUD0294` — the `data-fud-` namespace belongs to the compiler (SDD-15 §3.1).
 *
 * The HTML half of the reservation `FUD0290` enforces in JavaScript. Half of these tests are
 * about what must NOT be reported: `data-fud-space` is the author's on purpose, and an
 * ordinary `data-*` name is none of the compiler's business. The other half is the whole
 * namespace, not the two names emitted today — a rule that only knew about those would break
 * every page using the third one on the day it is added.
 */

import { describe, expect, it } from 'vitest';
import { parseDocument, type AtConstructParser } from '../../src/html/index.js';
import { parseControl } from '../../src/control/index.js';
import { parseCodeBlock } from '../../src/code/index.js';
import { parseDirective } from '../../src/layout/index.js';
import { structureDocument } from '../../src/document/index.js';
import { JsBatch } from '../../src/oxc/index.js';
import { analyze, type SemanticInput } from '../../src/semantic/index.js';
import type { Diagnostic } from '../../src/types/index.js';

const constructs: AtConstructParser = { parseControl, parseCodeBlock, parseDirective };

function diagnose(source: string): readonly Diagnostic[] {
  const html = parseDocument(source, { atConstructs: constructs }).value;
  const document = structureDocument(source, html).value;
  const js = new JsBatch(source).parse().value;
  const input: SemanticInput = {
    source,
    document,
    js,
    fragmentId: () => undefined,
    components: { has: () => true },
  };
  return analyze(input).diagnostics;
}

/** The names FUD0294 flags in a component whose template is `markup`. */
function reserved(markup: string): string[] {
  const source = `<m-el>\n  <template shadowrootmode="open">${markup}</template>\n</m-el>\n`;
  return diagnose(source)
    .filter((d) => d.code === 'FUD0294')
    .map((d) => source.slice(d.span.start, d.span.end));
}

describe('reserved-attributes — what FUD0294 catches', () => {
  it('rejects the markers the emit writes', () => {
    expect(reserved('<div data-fud-id="0"></div>')).toEqual(['data-fud-id="0"']);
    expect(reserved('<div data-fud-adopt="m-el"></div>')).toEqual(['data-fud-adopt="m-el"']);
  });

  it('rejects a name in the namespace that nothing emits — the namespace is reserved whole', () => {
    // The point of the rule. A version that only knew today's two markers would hand the
    // author a name that breaks on the day a third one is emitted.
    expect(reserved('<div data-fud-anything="1"></div>')).toEqual(['data-fud-anything="1"']);
    expect(reserved('<div data-fud-></div>')).toEqual(['data-fud-']);
  });

  it('rejects it however it is spelt: the DOM lowercases an attribute name', () => {
    expect(reserved('<div DATA-FUD-ID="0"></div>')).toEqual(['DATA-FUD-ID="0"']);
  });

  it('rejects a `.prop` of that name: since BUG-16 it lands on the host as an attribute', () => {
    expect(reserved('<m-child .data-fud-id="9"></m-child>')).toEqual(['.data-fud-id="9"']);
  });

  it('reports each occurrence, on every element and inside a control body', () => {
    expect(
      reserved('<div data-fud-id="0"></div>@if (x) {<p data-fud-adopt="a"></p>}'),
    ).toEqual(['data-fud-id="0"', 'data-fud-adopt="a"']);
  });

  it('reports it in a page too, not only in a component', () => {
    const source =
      '<!DOCTYPE html><html><head><title>t</title></head><body><div data-fud-id="0"></div></body></html>';
    expect(diagnose(source).map((d) => d.code)).toContain('FUD0294');
  });
});

describe('reserved-attributes — what it must leave alone', () => {
  it('says nothing about `data-fud-space`: that one is the author’s on purpose', () => {
    // BUG-07 §4.4. `white-space` crosses the shadow boundary, so no single file can deduce
    // that a subtree must keep its whitespace — the author is the one who knows.
    expect(reserved('<div data-fud-space="preserve"><b>keep   me</b></div>')).toEqual([]);
    expect(reserved('<div DATA-FUD-SPACE="preserve"></div>')).toEqual([]);
  });

  it('says nothing about an ordinary `data-*`, which is the author’s vocabulary', () => {
    expect(reserved('<div data-id="7" data-fud="x" data-fudge="y" data-fu-did="z"></div>')).toEqual([]);
  });

  it('says nothing about an event or a bus binding: neither reaches the document', () => {
    expect(reserved('<div @data-fud-id="@h"></div>')).toEqual([]);
    expect(reserved('<div bus:data-fud-id="@h"></div>')).toEqual([]);
  });

  it('says nothing about a `bus:(expr)` name, which is not a string at all', () => {
    expect(reserved('<div bus:(NAMES.a)="@h"></div>')).toEqual([]);
  });

  it('leaves the rest of the pass alone: a duplicate is still FUD0190', () => {
    const source =
      '<m-el>\n  <template shadowrootmode="open"><div class="a" class="b"></div></template>\n</m-el>\n';
    expect(diagnose(source).map((d) => d.code)).toEqual(['FUD0190']);
  });
});
