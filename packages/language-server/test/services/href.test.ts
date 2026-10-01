/**
 * The `href` completion and its diagnostic (SDD-24 §4.2, §6.5).
 *
 * The filter by role is the whole point: `rel="component"` must not offer a page, because the
 * resulting `<link>` would be a `FUD0435` the user then has to undo.
 */

import { describe, expect, it } from 'vitest';
import { DocumentCache } from '../../src/document-cache.js';
import { WorkspaceIndex } from '../../src/workspace-index.js';
import { regionAt } from '@fudic/compiler';
import { hrefDiagnostics, unresolvedHrefs } from '@fudic/typecheck';
import { hrefCompletions, relCompletions } from '../../src/services/href.js';
import { hrefContextAt, linkValueAt } from '../../src/services/position.js';
import { component, LAYOUT, memoryFs, MONOREPO, PAGE, route, TIENDA_ROUTE } from '../_support.js';

const SLUG = '/p/blog/[slug].fud';

const WORKSPACE: Record<string, string> = {
  '/p/components/app-badge.fud': component('app-badge'),
  '/p/components/site-nav.fud': component('site-nav'),
  '/p/layouts/_layout.fud': LAYOUT,
  '/p/layouts/_admin.fud': LAYOUT,
  '/p/about.fud': PAGE,
  '/p/components/ui.fud': '@snippet card(title: string) { <b>@title</b> }\n',
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

  it('offers files of snippets for rel="snippet", and neither components nor layouts', () => {
    // The third role a `rel` may point at (SDD-29 §4.3). A component here would be a
    // `FUD0836` the moment it landed: the file declares no `@snippet`.
    const { index, document, context } = contextAt(
      SLUG,
      `<link rel="snippet" href="|">\n<article>hi</article>\n`,
    );
    const items = hrefCompletions(document, index, context);

    expect(items.map((item) => item.href)).toEqual(['../components/ui.fud']);
    expect(items.every((item) => item.role === 'snippet')).toBe(true);
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

describe('hrefCompletions in a monorepo (BUG-43)', () => {
  it('offers its own files by path and its libraries by name, never the app next door', () => {
    const source = `<link rel="layout" href="../layouts/_layout.fud">\n<link rel="component" href="">\n<p>x</p>\n`;
    const index = new WorkspaceIndex(memoryFs(MONOREPO));
    index.scan('/ws');
    const document = new DocumentCache(index).get(TIENDA_ROUTE, 1, source);
    const context = hrefContextAt(source, document.document, source.indexOf('href=""') + 6)!;

    expect(hrefCompletions(document, index, context).map((item) => item.href)).toEqual([
      '../components/tienda-card.fud',
      '@acme/ui/ui-card.fud',
    ]);
  });
});

describe('relCompletions (BUG-43)', () => {
  /** The `rel` values offered at `|`, which must sit inside a `<link>`'s `rel`. */
  function relsAt(path: string, marked: string): readonly string[] {
    const offset = marked.indexOf('|');
    const source = marked.replace('|', '');
    const { document } = setup(path, source);
    const link = linkValueAt(regionAt(source, document.html, offset))!;
    return relCompletions(document, link.element).map((item) => item.rel);
  }

  it('offers a layout to a file that may still become a route', () => {
    expect(relsAt(SLUG, `<link rel="|">\n<article>hi</article>\n`)).toEqual([
      'component',
      'layout',
      'snippet',
    ]);
  });

  it('offers a route its own layout link back, and no second one', () => {
    expect(relsAt(SLUG, `<link rel="|" href="../layouts/_layout.fud">\n<article>hi</article>\n`)).toEqual([
      'component',
      'layout',
      'snippet',
    ]);
    expect(
      relsAt(SLUG, `<link rel="layout" href="../layouts/_layout.fud">\n<link rel="|">\n<article>hi</article>\n`),
    ).toEqual(['component', 'snippet']);
  });

  it('offers no layout to a component, a page or a layout', () => {
    expect(relsAt('/p/components/app-x.fud', `<link rel="|">\n${component('app-x')}`)).toEqual([
      'component',
      'snippet',
    ]);
    const page = PAGE.replace('<head>', '<head>\n    <link rel="|">');
    expect(relsAt('/p/other.fud', page)).toEqual(['component', 'snippet']);
    const layout = LAYOUT.replace('<head>', '<head>\n    <link rel="|">');
    expect(relsAt('/p/layouts/_other.fud', layout)).toEqual(['component', 'snippet']);
  });
});

describe('linkValueAt (BUG-43)', () => {
  it('answers inside any <link>, and nowhere else', () => {
    const source = `<link rel="stylesheet" href="a.css">\n<a href="b">x</a>\n`;
    const { document } = setup(SLUG, source);
    const at = (needle: string) => linkValueAt(regionAt(source, document.html, source.indexOf(needle)));

    expect(at('a.css')?.attribute.name).toBe('href');
    expect(at('stylesheet')?.attribute.name).toBe('rel');
    // A value, but of an <a>: its region is `attr-value` all the same.
    expect(regionAt(source, document.html, source.indexOf('b">x')).kind).toBe('attr-value');
    expect(at('b">x')).toBeUndefined();
    expect(at('x</a>')).toBeUndefined();
  });
});
