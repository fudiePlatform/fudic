/**
 * SDD-46 §3.3, criterion 4 — the names a component chooses on its root template.
 */

import { describe, expect, it } from 'vitest';
import { parseDocument, type AtConstructParser, type ElementNode } from '../../src/html/index.js';
import { atConstructs } from '../../src/constructs.js';
import { structureDocument } from '../../src/document/index.js';
import { adoptedStylesOf } from '../../src/binding/index.js';

const constructs: AtConstructParser = atConstructs;

/** The root template of a component written with `attrs` on it. */
function templateWith(attrs: string): { readonly source: string; readonly template: ElementNode | undefined } {
  const source = `<app-x><template shadowrootmode="open"${attrs}><p></p></template></app-x>`;
  const html = parseDocument(source, { atConstructs: constructs }).value;
  const document = structureDocument(source, html).value;
  const template = document.type === 'component-document' ? document.template : undefined;
  return { source, template };
}

describe('adoptedStylesOf', () => {
  it('reads the names in written order, each with the span of its word', () => {
    const { source, template } = templateWith(' shadowrootadoptedstylesheets="panel  forms"');
    const { names, problems } = adoptedStylesOf(template);
    expect(problems).toEqual([]);
    expect(names.map((n) => n.name)).toEqual(['panel', 'forms']);
    expect(names.map((n) => source.slice(n.span.start, n.span.end))).toEqual(['panel', 'forms']);
  });

  it('counts a repeated name once', () => {
    const { template } = templateWith(' shadowrootadoptedstylesheets="panel forms panel"');
    expect(adoptedStylesOf(template).names.map((n) => n.name)).toEqual(['panel', 'forms']);
  });

  it('reads the attribute whatever its case', () => {
    const { template } = templateWith(' ShadowRootAdoptedStyleSheets="panel"');
    expect(adoptedStylesOf(template).names.map((n) => n.name)).toEqual(['panel']);
  });

  it('is nothing without the attribute, with an empty one, and without a template', () => {
    expect(adoptedStylesOf(templateWith('').template)).toEqual({ names: [], problems: [] });
    expect(adoptedStylesOf(templateWith(' shadowrootadoptedstylesheets=""').template).names).toEqual([]);
    expect(adoptedStylesOf(undefined)).toEqual({ names: [], problems: [] });
  });

  it('refuses a value with an `@` in it: the list is chosen when compiling (FUD0745)', () => {
    const { source, template } = templateWith(' shadowrootadoptedstylesheets="panel @extra"');
    const { names, problems } = adoptedStylesOf(template);
    expect(names).toEqual([]);
    expect(problems.map((p) => p.code)).toEqual(['FUD0745']);
    expect(source.slice(problems[0]!.span.start, problems[0]!.span.end)).toMatch(/^shadowrootadoptedstylesheets=/u);
  });
});
