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
  return { source, document: parsed.document } as CachedDocument;
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

const CONTROL_FLOW = ['@if', '@if else', '@foreach', '@for', '@while', '@switch'];

const ROUTE = `<link rel="layout" href="../layouts/_layout.fud">

<article>|</article>
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

describe('snippetsAt — by role', () => {
  it('a component gets control flow and its own @code', () => {
    expect(labelsAt(HOST)).toEqual([...CONTROL_FLOW, '@code']);
  });

  it('a layout gets its three directives, and a route does not', () => {
    expect(labelsAt(LAYOUT)).toContain('@RenderBody');
    expect(labelsAt(LAYOUT)).toContain('@RenderHead');
    expect(labelsAt(LAYOUT)).toContain('@RenderSection');
    expect(labelsAt(ROUTE)).not.toContain('@RenderBody');
  });

  it('a route gets @section, and a layout does not', () => {
    expect(labelsAt(ROUTE)).toContain('@section');
    expect(labelsAt(LAYOUT)).not.toContain('@section');
  });

  it('the @code of a component is not the @code of a route', () => {
    const component = snippetsAt(cached(HOST.replace('|', '')), HOST.indexOf('|'));
    const route = snippetsAt(cached(ROUTE.replace('|', '')), ROUTE.indexOf('|'));

    expect(component.find((s) => s.label === '@code')?.body).toContain('props<');
    expect(route.find((s) => s.label === '@code')?.body).toContain('async function load');
  });

  it('a layout gets a bare @code: it never declares load (FUD0430)', () => {
    const layout = snippetsAt(cached(LAYOUT.replace('|', '')), LAYOUT.indexOf('|'));
    const code = layout.find((snippet) => snippet.label === '@code');

    expect(code?.body).not.toContain('load');
    expect(code?.body).toBe('@code {\n  $0\n}');
  });
});

describe('snippetsAt — the @code block appears once', () => {
  it('disappears as soon as the document has one', () => {
    const withCode = `@code {\n  const a = 1;\n}\n${HOST}`;

    expect(labelsAt(HOST)).toContain('@code');
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
