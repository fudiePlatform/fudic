/**
 * SDD-28 — the gates. What a snippet is worth is where it is offered, so this is the half
 * that gets tested first.
 */

import { describe, expect, it } from 'vitest';
import { parseFud } from '../../src/parse.js';
import { scopeAt, snippetsAt, SNIPPETS } from '../../src/services/snippets.js';
import type { CachedDocument } from '../../src/document-cache.js';

/** A `CachedDocument` with only what these functions read: the source and the tree. */
function cached(source: string): CachedDocument {
  const parsed = parseFud(source);
  return { source, document: parsed.document, html: parsed.html } as CachedDocument;
}

/** The scope at the offset marked with `|` in the source. */
function scopeAtCursor(marked: string): ReturnType<typeof scopeAt> {
  const offset = marked.indexOf('|');
  const source = marked.replace('|', '');
  return scopeAt(cached(source), offset);
}

describe('scopeAt', () => {
  it.each([[''], ['  '], ['\n\n']])('is empty-document anywhere in %j', (source) => {
    expect(scopeAt(cached(source), 0)).toBe('empty-document');
    expect(scopeAt(cached(source), source.length)).toBe('empty-document');
  });

  it('is markup inside the host template', () => {
    expect(scopeAtCursor('<app-x>\n  <template shadowrootmode="open">\n    |\n  </template>\n</app-x>')).toBe(
      'markup',
    );
  });

  it('is code-block inside @code', () => {
    expect(scopeAtCursor('@code {\n  |\n}\n<app-x>\n  <template shadowrootmode="open"></template>\n</app-x>')).toBe(
      'code-block',
    );
  });

  it('is nothing inside a <style> body — that is CSS', () => {
    expect(
      scopeAtCursor('<head>\n  <style>\n    :host { |color: red }\n  </style>\n</head>\n<app-x>\n  <template shadowrootmode="open"></template>\n</app-x>'),
    ).toBeUndefined();
  });

  it('is nothing inside an interpolation — that is an expression', () => {
    expect(
      scopeAtCursor('<app-x>\n  <template shadowrootmode="open">@(a.|b)</template>\n</app-x>'),
    ).toBeUndefined();
  });

  it('is markup again after the @code block ends', () => {
    const source = '@code {\n  const a = 1;\n}\n<app-x>\n  <template shadowrootmode="open">|</template>\n</app-x>';
    expect(scopeAtCursor(source)).toBe('markup');
  });
});

/** The labels offered at the `|` of a source, in catalogue order. */
function labelsAt(marked: string): readonly string[] {
  const offset = marked.indexOf('|');
  const source = marked.replace('|', '');
  return snippetsAt(cached(source), offset).map((snippet) => snippet.label);
}

const HOST = '<app-x>\n  <template shadowrootmode="open">\n    |\n  </template>\n</app-x>\n';

/** The same component, with the cursor at top level — where a `@code` may go. */
const HOST_TOP = '|\n<app-x>\n  <template shadowrootmode="open"></template>\n</app-x>\n';

const CONTROL_FLOW = ['@if', '@if else', '@foreach', '@for', '@while', '@switch'];

const ROUTE = `<link rel="layout" href="../layouts/_layout.fud">

<article>|</article>
`;

const ROUTE_TOP = `<link rel="layout" href="../layouts/_layout.fud">
|
<article>hi</article>
`;

const LAYOUT = `<!DOCTYPE html>
<html lang="es">
  <head>
    @RenderHead()
  </head>
  <body>
    <main>|@RenderBody()</main>
  </body>
</html>
`;

const LAYOUT_HEAD = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    |
    @RenderHead()
  </head>
  <body>
    <main>@RenderBody()</main>
  </body>
</html>
`;

describe('snippetsAt — the skeletons', () => {
  it('offers the four documents in an empty file, and only there', () => {
    expect(labelsAt('|')).toEqual(['component', 'route', 'page', 'layout']);
    expect(labelsAt(HOST)).not.toContain('component');
  });

  it('stops offering them once there is a comment: that is content', () => {
    const labels = labelsAt('@* nothing yet *@|');

    expect(labels).not.toContain('route');
    // And what is left is markup, because a comment is markup.
    expect(labels).toContain('@if');
  });
});

/** The snippet of this label at the `|`, for the cases where the body is what matters. */
function bodyAt(marked: string, label: string): string | undefined {
  const offset = marked.indexOf('|');
  return snippetsAt(cached(marked.replace('|', '')), offset).find((s) => s.label === label)?.body;
}

describe('snippetsAt — by role', () => {
  it('a component gets control flow inside its template, and no @code there', () => {
    expect(labelsAt(HOST)).toEqual(CONTROL_FLOW);
  });

  it('a layout gets its three directives, and a route does not', () => {
    expect(labelsAt(LAYOUT)).toContain('@RenderBody');
    expect(labelsAt(LAYOUT)).toContain('@RenderHead');
    expect(labelsAt(LAYOUT)).toContain('@RenderSection');
    expect(labelsAt(ROUTE)).not.toContain('@RenderBody');
  });

  it('a route gets @section at top level, and a layout never does', () => {
    expect(labelsAt(ROUTE_TOP)).toContain('@section');
    expect(labelsAt(LAYOUT)).not.toContain('@section');
  });

  it('the @code of a component is not the @code of a route', () => {
    expect(bodyAt(HOST_TOP, '@code')).toContain('props<');
    expect(bodyAt(ROUTE_TOP, '@code')).toContain('async function load');
  });

  it('a layout gets a bare @code: it never declares load (FUD0430)', () => {
    expect(bodyAt(LAYOUT_HEAD, '@code')).toBe('@code {\n  $0\n}');
  });
});

describe('snippetsAt — where a @code may go', () => {
  it('is offered at top level in a component and in a route, not inside an element', () => {
    expect(labelsAt(HOST_TOP)).toContain('@code');
    expect(labelsAt(HOST)).not.toContain('@code');
    expect(labelsAt(ROUTE_TOP)).toContain('@code');
    expect(labelsAt(ROUTE)).not.toContain('@code');
  });

  it('is offered inside <head> in a layout, not in the body (decision 59)', () => {
    // The cursor sits right after a `<meta>`: a tag with no closing tag has no content, so it
    // is never what the cursor is inside of — otherwise the offset would read as "inside a
    // meta" and the placement would fail.
    expect(labelsAt(LAYOUT_HEAD)).toContain('@code');
    expect(labelsAt(LAYOUT)).not.toContain('@code');
  });

  it('and a @section only at top level of the route (structure.ts)', () => {
    expect(labelsAt(ROUTE)).not.toContain('@section');
  });

  it('disappears as soon as the document has one', () => {
    const withCode = `@code {\n  const a = 1;\n}\n|\n<app-x>\n  <template shadowrootmode="open"></template>\n</app-x>\n`;

    expect(labelsAt(HOST_TOP)).toContain('@code');
    expect(labelsAt(withCode)).not.toContain('@code');
  });
});

describe('snippetsAt — inside @code', () => {
  const componentCode = '@code {\n  |\n}\n<app-x>\n  <template shadowrootmode="open"></template>\n</app-x>\n';
  const routeCode = '<link rel="layout" href="./_layout.fud">\n@code {\n  |\n}\n<article>hi</article>\n';

  it('a component gets props, @client and @server — and no markup at all', () => {
    expect(labelsAt(componentCode)).toEqual(['props', '@client', '@server']);
  });

  it('a route gets @server and load, but never @client', () => {
    expect(labelsAt(routeCode)).toEqual(['@server', 'load']);
  });
});

describe('the catalogue', () => {
  it('offers nothing where the scope is none — a <style> body', () => {
    const source = '<head>\n  <style>\n    :host { |color: red }\n  </style>\n</head>\n' + HOST.replace('|', '');
    expect(labelsAt(source)).toEqual([]);
  });

  it('declares a scope and a body for every entry', () => {
    for (const snippet of SNIPPETS) {
      expect(snippet.body.length, snippet.label).toBeGreaterThan(0);
      expect(snippet.detail.length, snippet.label).toBeGreaterThan(0);
    }
  });
});
