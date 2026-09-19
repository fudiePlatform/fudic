/**
 * SDD-29 §6.7 and §6.8 — the file a snippet lives in.
 *
 * Three things: a declaration is top-level and its position among the other top-level nodes
 * is free; a file with declarations and no host wrapper is the fifth role and not a broken
 * component; and a body holds markup and control flow but neither state nor style.
 */

import { describe, expect, it } from 'vitest';
import { parseDocument } from '../../src/html/index.js';
import { atConstructs } from '../../src/constructs.js';
import { structureDocument, type StructuredDocument } from '../../src/document/index.js';

function structure(source: string): { doc: StructuredDocument; codes: readonly string[] } {
  const parsed = parseDocument(source, { atConstructs });
  const structured = structureDocument(source, parsed.value);
  return {
    doc: structured.value,
    codes: [...parsed.diagnostics, ...structured.diagnostics].map((d) => d.code),
  };
}

const COMPONENT = '<app-card><template shadowrootmode="open"><i></i></template></app-card>';

describe('the fifth role: a file of snippets (§4.9)', () => {
  it('is a snippet document, not a component missing its host (criterion 32)', () => {
    const { doc, codes } = structure('@snippet card(title: string) { <article>@title</article> }');
    expect(doc.type).toBe('snippet-document');
    expect(codes).toEqual([]);
    expect(doc.snippets).toHaveLength(1);
  });

  it('carries its component links, which are its snippets dependencies (§4.5)', () => {
    const { doc } = structure(
      '<link rel="component" href="./app-button.fud">\n@snippet go(t: string) { <app-button>@t</app-button> }',
    );
    expect(doc.type).toBe('snippet-document');
    expect(doc.links).toHaveLength(1);
  });

  it('reports a @code at its top level: it has no state and nothing would run it (FUD0823)', () => {
    const { doc, codes } = structure('@code { const x = 1; }\n@snippet a() { <i></i> }');
    expect(doc.type).toBe('snippet-document');
    expect(codes).toContain('FUD0823');
  });

  it('is still a component when a host wrapper is there', () => {
    const { doc, codes } = structure(`@snippet a() { <i></i> }\n${COMPONENT}`);
    expect(doc.type).toBe('component-document');
    expect(codes).toEqual([]);
    expect(doc.snippets).toHaveLength(1);
  });

  it('is still FUD0156 when there is neither a host wrapper nor a declaration', () => {
    expect(structure('<div></div>').codes).toContain('FUD0156');
  });

  it('reports two declarations of one name in one file (FUD0834)', () => {
    const { codes } = structure('@snippet card() { <i></i> }\n@snippet card() { <b></b> }');
    expect(codes).toContain('FUD0834');
  });
});

describe('a declaration is top-level, and its position is free (§4.1)', () => {
  it('parses the same before the links, between them and after the markup (criterion 32)', () => {
    const link = '<link rel="component" href="./app-button.fud">';
    const before = structure(`@snippet a() { <i></i> }\n${link}\n${COMPONENT}`);
    const middle = structure(`${link}\n@snippet a() { <i></i> }\n${COMPONENT}`);
    const after = structure(`${link}\n${COMPONENT}\n@snippet a() { <i></i> }`);
    for (const parsed of [before, middle, after]) {
      expect(parsed.codes).toEqual([]);
      expect(parsed.doc.snippets).toHaveLength(1);
      expect(parsed.doc.type).toBe('component-document');
    }
  });

  it('reports one written inside an element (criterion 30, FUD0824)', () => {
    const { codes } = structure(`<app-card><template shadowrootmode="open">
      <div>@snippet a() { <i></i> }</div></template></app-card>`);
    expect(codes).toContain('FUD0824');
  });

  it('reports one written inside another declaration (criterion 30, FUD0824)', () => {
    const { codes } = structure('@snippet outer() { @snippet inner() { <i></i> } }');
    expect(codes).toContain('FUD0824');
  });

  it('is collected from the <head> of a page, where its links and its @code live', () => {
    const { doc, codes } = structure(
      '<!DOCTYPE html><html><head>@snippet a() { <i></i> }</head><body></body></html>',
    );
    expect(codes).toEqual([]);
    expect(doc.snippets).toHaveLength(1);
  });
});

describe('what a body may not hold (§4.2)', () => {
  it('reports a <style> (criterion 28, FUD0822)', () => {
    expect(structure('@snippet a() { <style>i { color: red }</style> }').codes).toContain('FUD0822');
  });

  it('reports a <style> nested deep inside the body', () => {
    expect(structure('@snippet a() { <div><p><style>i{}</style></p></div> }').codes).toContain(
      'FUD0822',
    );
  });

  it('reports a @code (criterion 29, FUD0823)', () => {
    expect(structure('@snippet a() { <i></i> @code { const x = 1; } }').codes).toContain('FUD0823');
  });

  it('reports a <head> (FUD0825)', () => {
    expect(structure('@snippet a() { <head><title>x</title></head> }').codes).toContain('FUD0825');
  });

  it('allows control flow (criterion 31)', () => {
    const { codes } = structure(
      '@snippet rows(items: string[]) { @foreach (const i of items) key (i) { <li>@i</li> } }',
    );
    expect(codes).toEqual([]);
  });
});

describe('<link rel="snippet"> (§4.3)', () => {
  it('takes the same top-level phase as a component link, in a component', () => {
    const { doc, codes } = structure(
      `<link rel="snippet" href="./ui.fud">\n<link rel="component" href="./app-button.fud">\n${COMPONENT}`,
    );
    expect(codes).toEqual([]);
    expect(doc.snippetLinks).toHaveLength(1);
    expect(doc.links).toHaveLength(1);
  });

  it('is reported when nested, like every other framework link (FUD0438)', () => {
    const { codes } = structure(`<app-card><template shadowrootmode="open">
      <link rel="snippet" href="./ui.fud"></template></app-card>`);
    expect(codes).toContain('FUD0438');
  });
});
