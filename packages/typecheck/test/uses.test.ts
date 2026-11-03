/**
 * SDD-63 §3.2 and §4.4 — where a component tag is used: `IndexedFud.uses`, read when each file
 * is indexed, and `FudIndex.usesOf`, which gathers them across the index.
 */

import { describe, expect, it } from 'vitest';
import { indexOf, component, route } from './_support.js';

const LINK = '<link rel="component" href="./components/app-card.fud">';

describe('IndexedFud.uses', () => {
  it('is every custom element of the markup, with the span of its tag name', () => {
    const source = route('./_layout.fud', ['./components/app-card.fud']).replace(
      '<article>hi</article>',
      '<article><app-card></app-card><p>x</p><x-other></x-other></article>',
    );
    const index = indexOf({ '/p/home.fud': source });
    const uses = index.get('/p/home.fud')?.uses ?? [];

    expect(uses.map((use) => use.tag)).toEqual(['app-card', 'x-other']);
    for (const use of uses) expect(source.slice(use.span.start, use.span.end)).toBe(use.tag);
  });

  it("never counts a component's own host as a use of itself", () => {
    const index = indexOf({ '/p/components/app-card.fud': component('app-card') });

    expect(index.get('/p/components/app-card.fud')?.uses).toEqual([]);
  });

  it('is what a component writes inside its own template too', () => {
    const source = component('app-list').replace('<span>', '<span><app-card></app-card>');
    const index = indexOf({ '/p/components/app-list.fud': source });

    expect(index.get('/p/components/app-list.fud')?.uses.map((use) => use.tag)).toEqual(['app-card']);
  });
});

describe('FudIndex.usesOf', () => {
  const page = (body: string): string =>
    `<link rel="layout" href="./_layout.fud">\n${LINK}\n${body}\n`;

  // Inserted out of order on purpose: the answer is ordered by path, not by when it was read.
  const index = indexOf({
    '/p/z.fud': page('<app-card></app-card>'),
    '/p/components/app-card.fud': component('app-card'),
    '/p/a.fud': page('<app-card></app-card>\n<app-card></app-card>'),
    '/p/m.fud': page('<p>none</p>'),
    '/p/ghost.fud': page('<app-ghost></app-ghost>'),
  });

  it('lists every use across the index, ordered by path and position', () => {
    const uses = index.usesOf('app-card');

    expect(uses.map((use) => use.path)).toEqual(['/p/a.fud', '/p/a.fud', '/p/z.fud']);
    expect(uses[0]!.span.start).toBeLessThan(uses[1]!.span.start);
  });

  it('keeps the order when the index already read the files in it', () => {
    const sorted = indexOf({
      '/p/components/app-card.fud': component('app-card'),
      '/p/a.fud': page('<app-card></app-card>'),
      '/p/z.fud': page('<app-card></app-card>'),
    });

    expect(sorted.usesOf('app-card').map((use) => use.path)).toEqual(['/p/a.fud', '/p/z.fud']);
  });

  it('is empty for a tag no indexed component defines', () => {
    expect(index.usesOf('app-ghost')).toEqual([]);
  });
});
