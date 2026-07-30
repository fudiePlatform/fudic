/**
 * The `href` completion and its diagnostic (SDD-24 §4.2, §6.5).
 *
 * The filter by role is the whole point: `rel="component"` must not offer a page, because the
 * resulting `<link>` would be a `FUD0435` the user then has to undo.
 */

import { describe, expect, it } from 'vitest';
import { DocumentCache } from '../../src/document-cache.js';
import { WorkspaceIndex } from '../../src/workspace-index.js';
import { hrefCompletions, hrefDiagnostics, unresolvedHrefs } from '../../src/services/href.js';
import { hrefContextAt } from '../../src/services/position.js';
import { component, LAYOUT, memoryFs, PAGE, route } from '../_support.js';

const SLUG = '/p/blog/[slug].fud';

const WORKSPACE: Record<string, string> = {
  '/p/components/app-badge.fud': component('app-badge'),
  '/p/components/site-nav.fud': component('site-nav'),
  '/p/layouts/_layout.fud': LAYOUT,
  '/p/layouts/_admin.fud': LAYOUT,
  '/p/about.fud': PAGE,
};

function setup(path: string, source: string) {
  const files = { ...WORKSPACE, [path]: source };
  const index = new WorkspaceIndex(memoryFs(files));
  index.scan('/p');
  const document = new DocumentCache(index).get(path, 1, source);

  return { index, document };
}

/** The href context at the position marked with `|` in the source. */
function contextAt(path: string, marked: string) {
  const offset = marked.indexOf('|');
  const source = marked.replace('|', '');
  const { index, document } = setup(path, source);
  const context = hrefContextAt(source, document.document, offset);

  return { index, document, context: context! };
}

describe('hrefCompletions', () => {
  it('offers components for rel="component" and no page among them', () => {
    const { index, document, context } = contextAt(
      SLUG,
      `<link rel="layout" href="../layouts/_layout.fud">\n<link rel="component" href="|">\n<article>hi</article>\n`,
    );

    expect(hrefCompletions(document, index, context).map((item) => item.href)).toEqual([
      '../components/app-badge.fud',
      '../components/site-nav.fud',
    ]);
  });

  it('offers layouts for rel="layout" and nothing else', () => {
    const { index, document, context } = contextAt(
      SLUG,
      `<link rel="layout" href="|">\n<article>hi</article>\n`,
    );
    const items = hrefCompletions(document, index, context);

    expect(items.map((item) => item.href)).toEqual([
      '../layouts/_admin.fud',
      '../layouts/_layout.fud',
    ]);
    expect(items.every((item) => item.role === 'layout')).toBe(true);
  });

  it('carries the tag a component defines, so the list can show what it declares', () => {
    const { index, document, context } = contextAt(
      SLUG,
      `<link rel="layout" href="../layouts/_layout.fud">\n<link rel="component" href="|">\n<p>x</p>\n`,
    );

    expect(hrefCompletions(document, index, context)[0]?.tag).toBe('app-badge');
  });

  it('never offers the file being edited', () => {
    const { index, document, context } = contextAt(
      '/p/components/app-card.fud',
      `<link rel="component" href="|">\n${component('app-card')}`,
    );

    expect(hrefCompletions(document, index, context).map((item) => item.path)).not.toContain(
      '/p/components/app-card.fud',
    );
  });
});

describe('unresolvedHrefs', () => {
  it('finds nothing when every link resolves', () => {
    const { index, document } = setup(
      SLUG,
      route('../layouts/_layout.fud', ['../components/app-badge.fud']),
    );

    expect(unresolvedHrefs(document, index)).toEqual([]);
  });

  it('reports the value span and where the file would go', () => {
    const source = route('../layouts/_layout.fud', ['../components/ghost.fud']);
    const { index, document } = setup(SLUG, source);
    const [unresolved] = unresolvedHrefs(document, index);

    expect(unresolved?.href).toBe('../components/ghost.fud');
    expect(source.slice(unresolved?.value.start, unresolved?.value.end)).toBe(
      '../components/ghost.fud',
    );
    expect(unresolved?.target).toBe('/p/components/ghost.fud');
  });

  it('leaves an empty or absent href to FUD0436, which owns that case', () => {
    const { index, document } = setup(
      SLUG,
      `<link rel="component" href="">\n<link rel="component">\n<article>hi</article>\n`,
    );

    expect(unresolvedHrefs(document, index)).toEqual([]);
  });
});

describe('hrefDiagnostics', () => {
  it('is FUD0460 over the value the user typed', () => {
    const source = route('../layouts/_layout.fud', ['../components/ghost.fud']);
    const { index, document } = setup(SLUG, source);
    const [diagnostic] = hrefDiagnostics(document, index);

    expect(diagnostic?.code).toBe('FUD0460');
    expect(diagnostic?.severity).toBe('error');
    expect(source.slice(diagnostic?.span.start, diagnostic?.span.end)).toBe(
      '../components/ghost.fud',
    );
  });
});
