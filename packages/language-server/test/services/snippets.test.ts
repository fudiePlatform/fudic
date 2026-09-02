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

/** A standalone page — no `@RenderBody`, so it is not a layout — with the cursor in its head. */
const PAGE_HEAD = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    |
  </head>
  <body>
    <h1>hi</h1>
  </body>
</html>
`;

/** The same page with the cursor in its body. */
const PAGE_BODY = PAGE_HEAD.replace('    |\n', '').replace('<h1>hi</h1>', '<h1>hi</h1>\n    |');

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

  it('a layout gets no @code at all: it declares nothing and loads nothing (FUD0437)', () => {
    // It used to be offered a bare one, narrowed from the route's on the grounds that a layout
    // has no `load`. The narrowing was the wrong half of the rule: a layout owns the shell, so
    // there is nothing a `@code` there could legally hold, and the block itself is the error.
    expect(bodyAt(LAYOUT_HEAD, '@code')).toBeUndefined();
  });
});

describe('snippetsAt — where a @code may go', () => {
  it('is offered at top level in a component and in a route, not inside an element', () => {
    expect(labelsAt(HOST_TOP)).toContain('@code');
    expect(labelsAt(HOST)).not.toContain('@code');
    expect(labelsAt(ROUTE_TOP)).toContain('@code');
    expect(labelsAt(ROUTE)).not.toContain('@code');
  });

  it('is offered inside the <head> of a page, and not in its body (decision 59)', () => {
    // A page writes its `@code` in the head, where a `<script>` would go, so `in-head` is the
    // placement that decides — and it is the only role left that has one.
    expect(labelsAt(PAGE_HEAD)).toContain('@code');
    expect(labelsAt(PAGE_BODY)).not.toContain('@code');
  });

  it('is never offered in a layout, head or body (FUD0437)', () => {
    // The cursor of `LAYOUT_HEAD` sits right after a `<meta>`: a tag with no closing tag has no
    // content, so it is never what the cursor is inside of. The placement is reachable and the
    // ROLE is what declines — the layout has no `@code` to be offered anywhere.
    expect(labelsAt(LAYOUT_HEAD)).not.toContain('@code');
    expect(labelsAt(LAYOUT)).not.toContain('@code');
  });

  it('and control flow is the mirror: the body of a page, never its head', () => {
    // A `<head>` is a list of declarations, not a template — nobody loops over `<meta>` — so a
    // `@foreach` offered there is noise in front of the two names the author is after.
    expect(labelsAt(PAGE_BODY)).toContain('@foreach');
    expect(labelsAt(PAGE_HEAD)).not.toContain('@foreach');
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

  it('a route gets the two zones and load, but never props', () => {
    // `@client` used to be the component's alone, which was the rule read backwards: what makes
    // a zone legal is the `@code` around it, and a route that declares a handler needs the
    // browser half as much as a component does. `props` stays the component's — nobody
    // instantiates a route as a tag.
    expect(labelsAt(routeCode)).toEqual(['@client', '@server', 'load']);
  });

  it('a zone already written is not offered again (decision 33.b, FUD0194)', () => {
    const withClient =
      '<link rel="layout" href="./_layout.fud">\n@code {\n  |\n  @client {\n  }\n}\n<article>hi</article>\n';
    const both =
      '<link rel="layout" href="./_layout.fud">\n@code {\n  |\n  @client {\n  }\n  @server {\n  }\n}\n<article>hi</article>\n';

    expect(labelsAt(withClient)).toEqual(['@server', 'load']);
    expect(labelsAt(both)).toEqual(['load']);
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
