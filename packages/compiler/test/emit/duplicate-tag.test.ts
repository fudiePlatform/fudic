/**
 * SDD-43 §4.5, criterion 10 — `FUD0761`: two files of one graph that define the same tag.
 *
 * `customElements` is one registry per document. While every component of a document came
 * from one project, two files under one tag meant somebody had copied a file; with libraries
 * the tag space is shared between packages written by people who never read each other's
 * code, and the second `define()` throws in the browser — at run time, on a page that built
 * cleanly.
 *
 * The graph keeps the FIRST file under that tag, as it always did, and the walk reports the
 * second. Which of the two has to be renamed is the author's call, so the message carries
 * both paths and the span points at the link that brought the second one in.
 */

import { describe, expect, it } from 'vitest';
import { resolveDocument, resolveComponents } from '../../src/emit/index.js';
import { memoryIo } from './_support.js';

/** A component `tag` whose shadow uses `uses`, linking `hrefs`. */
const component = (tag: string, hrefs: readonly string[] = [], uses = ''): string =>
  `${hrefs.map((h) => `<link rel="component" href="${h}">`).join('')}
<${tag}>
  <template shadowrootmode="open">${uses}</template>
</${tag}>
`;

/** A page that links `hrefs` and uses `body`. */
const page = (hrefs: readonly string[], body: string): string =>
  '<!DOCTYPE html><html><head>' +
  hrefs.map((h) => `<link rel="component" href="${h}">`).join('') +
  `</head><body>${body}</body></html>`;

const duplicates = (files: Record<string, string>, entry = '/app/page.fud'): readonly string[] =>
  resolveDocument(entry, memoryIo(files))
    .diagnostics.filter((d) => d.code === 'FUD0761')
    .map((d) => d.message);

describe('FUD0761 — one tag, two files', () => {
  it('reports the second file, with BOTH paths in the message', () => {
    const found = duplicates({
      '/app/page.fud': page(['../libs/ui/ui-card.fud', './ui-card.fud'], '<ui-card></ui-card>'),
      '/libs/ui/ui-card.fud': component('ui-card'),
      '/app/ui-card.fud': component('ui-card'),
    });
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('"ui-card"');
    expect(found[0]).toContain('/libs/ui/ui-card.fud');
    expect(found[0]).toContain('/app/ui-card.fud');
  });

  it('is an error, and points at the link that brought the second file in', () => {
    const source = page(['./a/ui-card.fud', './b/ui-card.fud'], '<ui-card></ui-card>');
    const second = '<link rel="component" href="./b/ui-card.fud">';
    const result = resolveDocument(
      '/app/page.fud',
      memoryIo({
        '/app/page.fud': source,
        '/app/a/ui-card.fud': component('ui-card'),
        '/app/b/ui-card.fud': component('ui-card'),
      }),
    );
    const diagnostic = result.diagnostics.find((d) => d.code === 'FUD0761');
    expect(diagnostic?.severity).toBe('error');
    expect(source.slice(diagnostic!.span.start, diagnostic!.span.end)).toBe(second);
  });

  it('keeps the FIRST file in the graph: the duplicate does not replace it', () => {
    const graph = resolveDocument(
      '/app/page.fud',
      memoryIo({
        '/app/page.fud': page(['./a/ui-card.fud', './b/ui-card.fud'], '<ui-card></ui-card>'),
        '/app/a/ui-card.fud': component('ui-card'),
        '/app/b/ui-card.fud': component('ui-card'),
      }),
    ).value;
    expect(graph.components.get('ui-card')?.path).toBe('/app/a/ui-card.fud');
  });

  it('says nothing about a SHARED dependency: one file reached twice is the common case', () => {
    // The badge is reached by the page and by the card. That is what a component library is
    // for, and it must stay silent — the check is about two files, not two links.
    expect(
      duplicates({
        '/app/page.fud': page(
          ['./ui-badge.fud', './ui-card.fud'],
          '<ui-badge></ui-badge><ui-card></ui-card>',
        ),
        '/app/ui-card.fud': component('ui-card', ['./ui-badge.fud'], '<ui-badge></ui-badge>'),
        '/app/ui-badge.fud': component('ui-badge'),
      }),
    ).toEqual([]);
  });

  it('reaches into a LIBRARY named as a package: the collision is the point of the check', () => {
    // `resolve` in the fake io answers a bare specifier the way a host's resolver does. What
    // the walk sees is two paths, which is all this check ever needed.
    const files: Record<string, string> = {
      '/app/page.fud': page(['@acme/ui/ui-card.fud', './ui-card.fud'], '<ui-card></ui-card>'),
      '/libs/ui/ui-card.fud': component('ui-card'),
      '/app/ui-card.fud': component('ui-card'),
    };
    const io = memoryIo(files);
    const found = resolveDocument('/app/page.fud', {
      read: io.read,
      resolve: (from, href) =>
        href === '@acme/ui/ui-card.fud' ? '/libs/ui/ui-card.fud' : io.resolve(from, href),
    }).diagnostics.filter((d) => d.code === 'FUD0761');
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain('/libs/ui/ui-card.fud');
  });

  it('says nothing when the ENTRY is one of the two, and everything when a page reaches both', () => {
    // A file compiled on its own is not a document: nothing runs a `define` for it alone.
    // The page that composes it reaches both files through the graph, and that is where the
    // two meet — so nothing is lost by leaving the entry out of the comparison, and what is
    // gained is that a file whose root element is a component tag (a page written as one
    // custom element, which structures as a component) does not accuse its own dependency.
    const files: Record<string, string> = {
      '/app/ui-card.fud': component('ui-card', ['../libs/ui/ui-card.fud'], '<p>mine</p>'),
      '/libs/ui/ui-card.fud': component('ui-card'),
      '/app/page.fud': page(['./ui-card.fud'], '<ui-card></ui-card>'),
    };
    expect(duplicates(files, '/app/ui-card.fud')).toEqual([]);
    expect(duplicates(files, '/app/page.fud')).toHaveLength(1);
  });

  it('says nothing about a CYCLE, and leaves the entry in the graph where readers expect it', () => {
    // A links B, B links A: the entry is reached through the graph under its own path. That
    // is one file, not two, and `entryComponent` relies on finding it in `components`.
    const io = memoryIo({
      '/app/ui-card.fud': component('ui-card', ['./ui-badge.fud'], '<ui-badge></ui-badge>'),
      '/app/ui-badge.fud': component('ui-badge', ['./ui-card.fud'], '<ui-card></ui-card>'),
    });
    const result = resolveDocument('/app/ui-card.fud', io);
    expect(result.diagnostics.filter((d) => d.code === 'FUD0761')).toEqual([]);
    expect(result.value.components.get('ui-card')?.path).toBe('/app/ui-card.fud');
    // And the same walk through the other entry point answers the same graph.
    expect(resolveComponents('/app/ui-card.fud', io).components.has('ui-card')).toBe(true);
  });

  it('reports a duplicate reached through the LAYOUT: the document is the whole chain', () => {
    expect(
      duplicates(
        {
          '/app/r.fud':
            '<link rel="layout" href="./shell.fud">' +
            '<link rel="component" href="./ui-card.fud"><ui-card></ui-card>',
          '/app/shell.fud':
            '<!DOCTYPE html><html><head><link rel="component" href="../libs/ui/ui-card.fud">' +
            '@RenderHead()</head><body>@RenderBody()</body></html>',
          '/libs/ui/ui-card.fud': component('ui-card'),
          '/app/ui-card.fud': component('ui-card'),
        },
        '/app/r.fud',
      ),
    ).toHaveLength(1);
  });

  it('reports once per link that brings the file in: two links are two places to fix', () => {
    expect(
      duplicates({
        '/app/page.fud': page(
          ['./a/ui-card.fud', './b/ui-card.fud', './c/other.fud'],
          '<ui-card></ui-card><app-other></app-other>',
        ),
        '/app/a/ui-card.fud': component('ui-card'),
        '/app/b/ui-card.fud': component('ui-card'),
        // A third link reaches the same wrong file from somewhere else.
        '/app/c/other.fud': component('app-other', ['../b/ui-card.fud'], '<ui-card></ui-card>'),
      }),
    ).toHaveLength(2);
  });
});
