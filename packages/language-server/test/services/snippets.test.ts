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

  it('a layout gets its directives each where it is legal, and a route gets none', () => {
    // The body of a layout is markup (SDD-48 §4.1): control flow and its two holes. What it
    // still does not write is `@RenderHead()`, which lives in the head (`FUD0431`).
    expect(labelsAt(LAYOUT)).toEqual([
      '@if',
      '@if else',
      '@foreach',
      '@for',
      '@while',
      '@switch',
      '@RenderBody',
      '@RenderSection',
    ]);
    expect(labelsAt(LAYOUT_HEAD)).toContain('@RenderHead');
    expect(labelsAt(LAYOUT_HEAD)).not.toContain('@RenderBody');
    expect(labelsAt(LAYOUT_HEAD)).not.toContain('@RenderSection');
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

  it('a layout gets a @code that declares its props and nothing else (BUG-44 §3.3)', () => {
    // `FUD0437` was retired by SDD-40: a layout's `@code` declares the props its routes
    // resolve, and that is all it may hold (`FUD0700`). So no `load`, and no zone.
    const body = bodyAt(LAYOUT_HEAD, '@code');
    expect(body).toContain('type ${1:Props}');
    expect(body).toContain('props<${1:Props}>()');
    expect(body).not.toContain('load');
    expect(body).not.toContain('@client');
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

  it('is offered in the <head> of a layout, and not in its body', () => {
    // The cursor of `LAYOUT_HEAD` sits right after a `<meta>`: a tag with no closing tag has no
    // content, so it is never what the cursor is inside of. The head is where a layout's
    // `@code` goes, as a page's does.
    expect(labelsAt(LAYOUT_HEAD)).toContain('@code');
    expect(labelsAt(LAYOUT)).not.toContain('@code');
  });

  it('is not offered in a layout that already has one', () => {
    const withCode = LAYOUT_HEAD.replace(
      '<meta charset="utf-8">',
      '@code {\n      const { a } = props<{ a: string }>();\n    }\n    <meta charset="utf-8">',
    );
    expect(labelsAt(withCode)).not.toContain('@code');
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

  it('a route gets the two zones in its neutral zone, and never props', () => {
    // `@client` used to be the component's alone, which was the rule read backwards: what makes
    // a zone legal is the `@code` around it, and a route that declares a handler needs the
    // browser half as much as a component does. `props` stays the component's — nobody
    // instantiates a route as a tag. `load` lives in `@server` now (BUG-44 §3.3).
    expect(labelsAt(routeCode)).toEqual(['@client', '@server']);
  });

  it('a zone already written is not offered again (decision 33.b, FUD0194)', () => {
    const withClient =
      '<link rel="layout" href="./_layout.fud">\n@code {\n  |\n  @client {\n  }\n}\n<article>hi</article>\n';
    const both =
      '<link rel="layout" href="./_layout.fud">\n@code {\n  |\n  @client {\n  }\n  @server {\n  }\n}\n<article>hi</article>\n';

    expect(labelsAt(withClient)).toEqual(['@server']);
    expect(labelsAt(both)).toEqual([]);
  });
});

describe('snippetsAt — each @code snippet belongs to one zone (BUG-44 §3.3, criterion 7)', () => {
  const routeServer =
    '<link rel="layout" href="./_layout.fud">\n@code {\n  @server {\n    |\n  }\n}\n<article>hi</article>\n';
  const routeClient =
    '<link rel="layout" href="./_layout.fud">\n@code {\n  @client {\n    |\n  }\n}\n<article>hi</article>\n';
  const pageServer = PAGE_HEAD.replace(
    '    |\n',
    '    @code {\n      @server {\n        |\n      }\n    }\n',
  );
  const componentServer =
    '@code {\n  @server {\n    |\n  }\n}\n<app-x>\n  <template shadowrootmode="open"></template>\n</app-x>\n';
  const layoutCode = LAYOUT_HEAD.replace('    |\n', '    @code {\n      |\n    }\n');

  it('declares a zone for every snippet of `@code`, and for nothing else', () => {
    for (const snippet of SNIPPETS) {
      if (snippet.scope === 'code-block') expect(snippet.zone, snippet.label).toBeDefined();
      else expect(snippet.zone, snippet.label).toBeUndefined();
    }
  });

  it('inside a route’s @server: its three exports, and no zone, no props', () => {
    expect(labelsAt(routeServer)).toEqual(['load', 'paths', 'layout']);
  });

  it('inside a page’s @server: load and paths — a page has no layout to resolve', () => {
    expect(labelsAt(pageServer)).toEqual(['load', 'paths']);
  });

  it('inside a component’s @server, and inside any @client: nothing of ours', () => {
    expect(labelsAt(componentServer)).toEqual([]);
    expect(labelsAt(routeClient)).toEqual([]);
  });

  it('a layout’s @code offers `props` and no zone', () => {
    expect(labelsAt(layoutCode)).toEqual(['props']);
  });

  it('the snippets write a resolver and a paths the projection can type', () => {
    const at = (label: string): string | undefined => bodyAt(routeServer, label);
    expect(at('layout')).toBe('export function layout(ctx, data) {\n  return { $0 };\n}');
    expect(at('paths')).toBe('export async function paths(): Promise<string[]> {\n  return [$0];\n}');
    expect(SNIPPETS.find((s) => s.label === 'layout' && s.scope === 'code-block')?.suggest).toBe(true);
  });
});

describe('snippetsAt — the <link> of fudic (BUG-43)', () => {
  const LINKS = ['link-component', 'link-snippet', 'link-layout'];
  const links = (marked: string) => labelsAt(marked).filter((label) => label.startsWith('link-'));

  it('offers a file being started all three, a layout among them', () => {
    expect(links('<link rel="component" href="./a.fud">\n|\n<main>hi</main>\n')).toEqual(LINKS);
  });

  it('offers a route and a component the two imports at top level, and no second layout', () => {
    expect(links(ROUTE_TOP)).toEqual(['link-component', 'link-snippet']);
    expect(links(HOST_TOP)).toEqual(['link-component', 'link-snippet']);
    expect(links(HOST)).toEqual([]);
  });

  it('offers a page and a layout the two imports in their <head>, and not in the body', () => {
    expect(links(PAGE_HEAD)).toEqual(['link-component', 'link-snippet']);
    expect(links(LAYOUT_HEAD)).toEqual(['link-component', 'link-snippet']);
    expect(links(PAGE_BODY)).toEqual([]);
  });

  it('ends inside the href, and asks for the list of what it can link', () => {
    const snippet = SNIPPETS.find((s) => s.label === 'link-layout');
    expect(snippet?.body).toBe('<link rel="layout" href="$0">');
    expect(SNIPPETS.filter((s) => s.label.startsWith('link-')).every((s) => s.suggest)).toBe(true);
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
