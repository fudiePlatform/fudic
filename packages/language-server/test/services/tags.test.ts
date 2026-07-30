/**
 * Tag completion and document links (SDD-24 §6.4).
 *
 * A declared tag comes from a `<link>` of THIS file, not from the workspace: a component that
 * exists somewhere is not in scope until it is linked, and offering it would produce markup the
 * checker then rejects.
 */

import { describe, expect, it } from 'vitest';
import { DocumentCache } from '../../src/document-cache.js';
import { WorkspaceIndex } from '../../src/workspace-index.js';
import { declaredTags, documentLinks, tagDefinitionAt } from '../../src/services/tags.js';
import { component, LAYOUT, memoryFs, PAGE, route } from '../_support.js';

const SLUG = '/p/blog/[slug].fud';

const WORKSPACE: Record<string, string> = {
  '/p/components/app-badge.fud': component('app-badge'),
  '/p/components/site-nav.fud': component('site-nav'),
  '/p/layouts/_layout.fud': LAYOUT,
  '/p/about.fud': PAGE,
};

function setup(path: string, source: string) {
  const files = { ...WORKSPACE, [path]: source };
  const index = new WorkspaceIndex(memoryFs(files));
  index.scan('/p');

  return { index, document: new DocumentCache(index).get(path, 1, source) };
}

describe('declaredTags', () => {
  it('lists what this file linked, in the order it linked it', () => {
    const { index, document } = setup(
      SLUG,
      route('../layouts/_layout.fud', [
        '../components/site-nav.fud',
        '../components/app-badge.fud',
      ]),
    );

    expect(declaredTags(document, index).map((tag) => tag.tag)).toEqual(['site-nav', 'app-badge']);
  });

  it('carries the href as written, which is what the projection imports', () => {
    const { index, document } = setup(
      SLUG,
      route('../layouts/_layout.fud', ['../components/app-badge.fud']),
    );

    expect(declaredTags(document, index)[0]).toEqual({
      tag: 'app-badge',
      href: '../components/app-badge.fud',
      path: '/p/components/app-badge.fud',
    });
  });

  it('drops a link with no href, one that resolves nowhere, and one with no tag', () => {
    const { index, document } = setup(
      SLUG,
      `<link rel="component">\n<link rel="component" href="../components/ghost.fud">\n<link rel="component" href="../about.fud">\n<article>hi</article>\n`,
    );

    expect(declaredTags(document, index)).toEqual([]);
  });
});

describe('tagDefinitionAt', () => {
  const SOURCE = route('../layouts/_layout.fud', ['../components/app-badge.fud']).replace(
    '<article>hi</article>',
    '<article><app-badge>hi</app-badge><div>x</div></article>',
  );

  it.each([
    ['the opening tag', '<app-badge>', 3],
    ['the closing tag', '</app-badge>', 4],
  ])('points %s at the file that defines it', (_label, needle, delta) => {
    const { index, document } = setup(SLUG, SOURCE);
    const found = tagDefinitionAt(document, index, SOURCE.indexOf(needle) + delta);

    expect(found?.target).toBe('/p/components/app-badge.fud');
    // The name only: the editor underlines what it will navigate from.
    expect(SOURCE.slice(found?.span.start, found?.span.end)).toBe('app-badge');
  });

  it('says nothing over a native tag or away from any tag', () => {
    const { index, document } = setup(SLUG, SOURCE);

    expect(tagDefinitionAt(document, index, SOURCE.indexOf('<div>') + 2)).toBeUndefined();
    expect(tagDefinitionAt(document, index, SOURCE.indexOf('hi</app-badge>'))).toBeUndefined();
  });

  it('says nothing over a tag whose <link> is missing: FUD0191 already does', () => {
    const source = SOURCE.replace(
      '<link rel="component" href="../components/app-badge.fud">\n',
      '',
    );
    const { index, document } = setup(SLUG, source);

    expect(tagDefinitionAt(document, index, source.indexOf('<app-badge>') + 3)).toBeUndefined();
  });
});

describe('documentLinks', () => {
  it('underlines every href that resolves, layout included', () => {
    const source = route('../layouts/_layout.fud', ['../components/app-badge.fud']);
    const { index, document } = setup(SLUG, source);
    const links = documentLinks(document, index);

    expect(links.map((link) => link.target)).toEqual([
      '/p/components/app-badge.fud',
      '/p/layouts/_layout.fud',
    ]);
    expect(source.slice(links[0]?.span.start, links[0]?.span.end)).toBe(
      '../components/app-badge.fud',
    );
  });

  it('does not link to nowhere: an unresolved href is FUD0460, not a link', () => {
    const { index, document } = setup(
      SLUG,
      `<link rel="component" href="../components/ghost.fud">\n<link rel="component" href="">\n<link rel="component">\n<article>hi</article>\n`,
    );

    expect(documentLinks(document, index)).toEqual([]);
  });
});
