/**
 * SDD-42 §4.5, criterion 9 — `:root` inside a shadow root matches nothing.
 *
 * Two halves, and the second is the one that is easy to get wrong: the warning is an
 * ADVICE and not a pruning, so the sheet reaches the document exactly as written.
 */

import { describe, expect, it } from 'vitest';
import {
  lintProjectStyle,
  FUD_DOCUMENT_ONLY_SELECTOR,
  resolveComponents,
  type ProjectStyle,
} from '../../src/emit/index.js';
import { memoryIo, pageModuleOf, ssrIo } from './_support.js';

/** The codes of every rule the linter objects to, in source order. */
const codes = (css: string): readonly string[] => lintProjectStyle(css).map((d) => d.code);
/** The selector each objection names, read back out of its message. */
const names = (css: string): readonly string[] =>
  lintProjectStyle(css).map((d) => /^a "([^"]+)"/.exec(d.message)![1]!);

describe('SDD-42 §4.5 — the selectors a project sheet cannot use', () => {
  it('warns on `:root`, with the span of the selector and not of the file', () => {
    const css = ':root { --gap: 8px; }';
    const [d] = lintProjectStyle(css);

    expect(d).toBeDefined();
    expect(d!.code).toBe(FUD_DOCUMENT_ONLY_SELECTOR);
    expect(d!.severity).toBe('warning');
    expect(d!.span).toEqual({ start: 0, end: 5 });
    expect(css.slice(d!.span.start, d!.span.end)).toBe(':root');
    // The repair is in the message: the other sheet of §4.2, the one the document loads.
    expect(d!.message).toContain('<link rel="stylesheet">');
  });

  it('warns on `html` and on `body` the same way', () => {
    expect(names('html { font: 16px/1.5 system-ui; }')).toEqual(['html']);
    expect(names('body { margin: 0; }')).toEqual(['body']);
  });

  it('names the offender of a selector list, wherever in it it sits', () => {
    const css = 'h1, body { margin: 0; }';
    const [d] = lintProjectStyle(css);

    expect(d!.message).toContain('"body"');
    expect(css.slice(d!.span.start, d!.span.end)).toBe('h1, body');
  });

  it('reports every rule, in source order', () => {
    expect(names(':root { --gap: 8px; }\nbody { margin: 0; }\n.card { padding: 0; }')).toEqual([
      ':root',
      'body',
    ]);
  });

  it('sees through an at-rule: a document-only rule is dead wherever it is nested', () => {
    expect(names('@media (min-width: 30em) { body { margin: 0; } }')).toEqual(['body']);
  });

  it('says nothing about the at-rule prelude itself', () => {
    expect(codes('@media (min-width: 30em) { .card { padding: 0; } }')).toEqual([]);
    expect(codes('@layer base, body;\n.card { padding: 0; }')).toEqual([]);
  });

  it('says nothing about what a project sheet is FOR', () => {
    expect(codes(':host { display: block; }')).toEqual([]);
    expect(codes(':host([open]) .card > .row { padding: var(--gap); }')).toEqual([]);
    expect(codes('::slotted(p) { margin: 0; }')).toEqual([]);
  });

  it('does not mistake a class, an id or an attribute value for an element', () => {
    expect(codes('.body { margin: 0; }')).toEqual([]);
    expect(codes('#html { margin: 0; }')).toEqual([]);
    expect(codes('[data-x=body] { margin: 0; }')).toEqual([]);
    expect(codes('[title="body"] { margin: 0; }')).toEqual([]);
    expect(codes("[title='html'] { margin: 0; }")).toEqual([]);
  });

  it('does not mistake a longer name that starts the same', () => {
    expect(codes('htmlx { margin: 0; }')).toEqual([]);
    expect(codes('body-copy { margin: 0; }')).toEqual([]);
    expect(codes(':rootish { margin: 0; }')).toEqual([]);
  });

  it('reads a minified sheet, where the name ends against the brace', () => {
    expect(names('body{margin:0}')).toEqual(['body']);
    expect(names(':root{--gap:8px}')).toEqual([':root']);
  });

  it('reads a functional pseudo-class as the compound start it is', () => {
    expect(names(':is(body) .card { padding: 0; }')).toEqual(['body']);
  });

  it('ignores a comment, wherever it sits and however it ends', () => {
    expect(codes('/* body { margin: 0 } */ .card { padding: 0; }')).toEqual([]);
    expect(codes('.card /* body */ .row { padding: 0; }')).toEqual([]);
    expect(codes('.card { padding: 0; } /* body { margin: 0 }')).toEqual([]);
  });

  it('ignores a string, and does not run past an unterminated one', () => {
    expect(codes('.card::after { content: "body {"; }')).toEqual([]);
    expect(codes('.card::after { content: "\\" body {"; }')).toEqual([]);
    expect(codes('.card::after { content: "body {')).toEqual([]);
  });

  it('is quiet on a sheet with nothing to say', () => {
    expect(codes('')).toEqual([]);
    expect(codes('{ }')).toEqual([]);
    // A stray `@` is a Razor atom to the parser (SDD-09 §2), and an atom is not a selector.
    expect(codes('@bogus .body { margin: 0; }')).toEqual([]);
  });
});

describe('SDD-42 §4.5 — an advice, not a pruning', () => {
  it('emits the offending rule into the document unchanged', async () => {
    const io = memoryIo({
      '/home.fud':
        '<!DOCTYPE html>\n<html><head><link rel="component" href="./s-card.fud"><title>t</title></head>' +
        '<body><s-card></s-card></body></html>',
      '/s-card.fud':
        '<head><style>.card { padding: 8px; }</style></head>\n' +
        '<s-card><template shadowrootmode="open"><div class="card"><slot></slot></div></template></s-card>',
    });
    const theme: ProjectStyle = { specifier: '_theme', css: ':root { --gap: 8px; }' };

    const page = await pageModuleOf(resolveComponents('/home.fud', io), {
      projectStyles: [theme],
    });
    const html = [...page({}, ssrIo().io)].join('');

    expect(html).toContain('<style type="module" specifier="_theme">:root{--gap:8px;}</style>');
    expect(html).toContain('shadowrootadoptedstylesheets="_theme s-card"');
  });
});
