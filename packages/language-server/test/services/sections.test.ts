/**
 * Section completion (SDD-24 §6.6).
 *
 * The names come from the layout's `@RenderSection` (decision 84) through the index, so the
 * completion costs no parse — and a section the file already fills is still offered, because
 * the one being typed is usually one of them.
 */

import { describe, expect, it } from 'vitest';
import { DocumentCache } from '../../src/document-cache.js';
import { WorkspaceIndex } from '../../src/workspace-index.js';
import { sectionCompletions } from '../../src/services/sections.js';
import { component, memoryFs, route } from '../_support.js';

const SLUG = '/p/blog/[slug].fud';

const LAYOUT_WITH_SECTIONS = `<!DOCTYPE html>
<html lang="es">
  <head>
    @RenderHead()
  </head>
  <body>
    <header>
      @RenderSection(nav)
    </header>
    <aside>
      @RenderSection(aside)
    </aside>
    <main>
      @RenderBody()
    </main>
  </body>
</html>
`;

function setup(path: string, source: string, extra: Readonly<Record<string, string>> = {}) {
  const files = { '/p/layouts/_layout.fud': LAYOUT_WITH_SECTIONS, ...extra, [path]: source };
  const index = new WorkspaceIndex(memoryFs(files));
  index.scan('/p');

  return { index, document: new DocumentCache(index).get(path, 1, source) };
}

describe('sectionCompletions', () => {
  it('offers what the layout declares, in source order', () => {
    const { index, document } = setup(SLUG, route('../layouts/_layout.fud'));

    expect(sectionCompletions(document, index)).toEqual(['nav', 'aside']);
  });

  it('offers a section the route already fills: it is the one being typed', () => {
    const source = `<link rel="layout" href="../layouts/_layout.fud">\n@section nav {\n  <p>x</p>\n}\n<article>hi</article>\n`;
    const { index, document } = setup(SLUG, source);

    expect(sectionCompletions(document, index)).toContain('nav');
  });

  it('offers nothing when the layout href resolves to nothing', () => {
    const { index, document } = setup(SLUG, route('../layouts/_ghost.fud'));

    expect(sectionCompletions(document, index)).toEqual([]);
  });

  it('offers nothing in a file with no layout at all', () => {
    const { index, document } = setup('/p/components/app-card.fud', component('app-card'));

    expect(sectionCompletions(document, index)).toEqual([]);
  });

  it('skips a @RenderSection whose argument was not an identifier (FUD0433)', () => {
    const broken = LAYOUT_WITH_SECTIONS.replace('@RenderSection(aside)', '@RenderSection("aside")');
    const { index, document } = setup(SLUG, route('../layouts/_layout.fud'), {
      '/p/layouts/_layout.fud': broken,
    });

    expect(sectionCompletions(document, index)).toEqual(['nav']);
  });
});
