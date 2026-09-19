/**
 * BUG-32 T7 — FUD0721: a `<link rel="component">` whose tag appears nowhere in the file.
 *
 * A warning and not an error, decided rather than inherited: an unused import is a warning
 * in every language that has one, and here it is also the state a file passes through while
 * its template is being rewritten. Breaking the build over it would punish the middle of an
 * edit.
 *
 * The interesting half is where the usages are counted. They come from `documentRoots`,
 * which gives each document shape the right roots — and a route uses a tag in its markup OR
 * inside an `@section`. Counting the markup alone would report a false positive the moment
 * a route filled a layout's section with the component it just imported, which is the case
 * this task exists to get right.
 */

import { describe, expect, it } from 'vitest';
import { resolveComponents, resolveDocument, contractDiagnostics } from '../../src/emit/index.js';
import { memoryIo } from './_support.js';

const FUD_UNUSED = 'FUD0721';

const BADGE = `<app-badge>
  <template shadowrootmode="open"><span><slot></slot></span></template>
</app-badge>
`;

const LINK = '<link rel="component" href="./app-badge.fud">';

/** The codes a graph reports, in order. */
const codes = (graph: Parameters<typeof contractDiagnostics>[0]): readonly string[] =>
  contractDiagnostics(graph).map((d) => d.code);

/** A page that links the badge and holds `body`. */
const pageGraph = (body: string, links = LINK): ReturnType<typeof resolveComponents> =>
  resolveComponents(
    '/page.fud',
    memoryIo({
      '/page.fud': `<!DOCTYPE html>\n<html>\n<head>${links}</head>\n<body>${body}</body>\n</html>\n`,
      '/app-badge.fud': BADGE,
    }),
  );

describe('FUD0721 — the link that leads nowhere', () => {
  it('warns when the tag is declared and never written', () => {
    expect(codes(pageGraph('<p>nothing here</p>'))).toContain(FUD_UNUSED);
  });

  it('is a warning, not an error: a half-rewritten template still builds', () => {
    const diagnostic = contractDiagnostics(pageGraph('<p>nothing</p>')).find(
      (d) => d.code === FUD_UNUSED,
    )!;
    expect(diagnostic.severity).toBe('warning');
  });

  it('names the tag and says what to do, and points at the link itself', () => {
    const source = `<!DOCTYPE html>\n<html>\n<head>${LINK}</head>\n<body><p>x</p></body>\n</html>\n`;
    const diagnostic = contractDiagnostics(pageGraph('<p>x</p>')).find((d) => d.code === FUD_UNUSED)!;
    expect(diagnostic.message).toContain('`<app-badge>`');
    expect(diagnostic.message).toContain('used nowhere in this file');
    expect(source.slice(diagnostic.span.start, diagnostic.span.end)).toContain('rel="component"');
  });

  it('says nothing when the tag IS written', () => {
    expect(codes(pageGraph('<app-badge>hi</app-badge>'))).not.toContain(FUD_UNUSED);
  });

  it('says nothing when there is no link at all', () => {
    expect(codes(pageGraph('<p>x</p>', ''))).not.toContain(FUD_UNUSED);
  });
});

describe('what counts as a use', () => {
  it('a tag used deep inside the markup counts', () => {
    expect(codes(pageGraph('<section><div><app-badge>hi</app-badge></div></section>'))).not.toContain(
      FUD_UNUSED,
    );
  });

  it('the component’s OWN identity tag is a declaration, not a use', () => {
    // Decision 75: the host IS the component, so a file whose only occurrence of the linked
    // tag is its own wrapper has still not used the link. Entry is the COMPONENT here, which
    // is the shape where the two can collide at all.
    const graph = resolveComponents(
      '/app-badge.fud',
      memoryIo({
        '/app-badge.fud': `<link rel="component" href="./app-badge-copy.fud">\n${BADGE}`,
        '/app-badge-copy.fud': `<app-badge-copy>\n  <template shadowrootmode="open"><p>y</p></template>\n</app-badge-copy>\n`,
      }),
    );
    expect(codes(graph)).toContain(FUD_UNUSED);
  });

  it('a link that does not resolve to a component gets no complaint from this rule', () => {
    // The resolver already speaks for a link that is not a component, and a second complaint
    // about a file this pass could not read would be inventing an error over an absence.
    const graph = resolveComponents(
      '/page.fud',
      memoryIo({
        '/page.fud':
          '<!DOCTYPE html>\n<html>\n<head><link rel="component" href="./other.fud"></head>\n<body><p>x</p></body>\n</html>\n',
        '/other.fud': '<!DOCTYPE html><html><head></head><body><p>a page, not a component</p></body></html>',
      }),
    );
    expect(codes(graph)).not.toContain(FUD_UNUSED);
  });
});

describe('a snippet body uses it — the same false positive, one role further', () => {
  /**
   * A file of snippets is the shape where the body is the ONLY markup there is: it has no
   * host wrapper and no page markup, so every tag it instantiates lives inside a `@snippet`.
   * The walk stopped at the construct, so such a file was told each of its links was unused
   * while its bodies were using all of them — a warning whose only fix is to delete the link
   * the file needs (SDD-29, task 15).
   */
  const snippetFile = (body: string): ReturnType<typeof resolveComponents> =>
    resolveComponents(
      '/ui.fud',
      memoryIo({
        '/ui.fud': `${LINK}\n@snippet action(label: string) { ${body} }\n`,
        '/app-badge.fud': BADGE,
      }),
    );

  it('a tag used only inside a `@snippet` body is used', () => {
    expect(codes(snippetFile('<app-badge>@label</app-badge>'))).not.toContain(FUD_UNUSED);
  });

  it('and when no body uses it, the warning still comes', () => {
    expect(codes(snippetFile('<em>@label</em>'))).toContain(FUD_UNUSED);
  });

  it('holds for a snippet declared inside a component too', () => {
    // Not only the fifth role: a component that declares a local snippet resolves the tags
    // of its body against its own links, exactly as its template does.
    const graph = resolveComponents(
      '/app-host.fud',
      memoryIo({
        '/app-host.fud':
          `${LINK}\n<app-host><template shadowrootmode="open"><p>@render row()</p></template></app-host>\n` +
          '@snippet row() { <app-badge>x</app-badge> }\n',
        '/app-badge.fud': BADGE,
      }),
    );
    expect(codes(graph)).not.toContain(FUD_UNUSED);
  });
});

describe('a route fills a section with it — the false positive T7 exists to avoid', () => {
  const LAYOUT =
    '<!DOCTYPE html><html><head>@RenderHead()</head>' +
    '<body><header>@RenderSection(meta)</header><main>@RenderBody()</main></body></html>';

  /** A route under the layout, whose markup is `body` and whose section holds `section`. */
  const routeGraph = (body: string, section: string): ReturnType<typeof resolveDocument> =>
    resolveDocument(
      '/r.fud',
      memoryIo({
        '/r.fud': `<link rel="layout" href="./l.fud">${LINK}${body}@section meta { ${section} }`,
        '/l.fud': LAYOUT,
        '/app-badge.fud': BADGE,
      }),
    );

  it('a tag used ONLY inside an `@section` is used', () => {
    const { value } = routeGraph('<h1>Blog</h1>', '<app-badge>new</app-badge>');
    expect(codes(value)).not.toContain(FUD_UNUSED);
  });

  it('and when it is in neither, the warning still comes', () => {
    const { value } = routeGraph('<h1>Blog</h1>', '<em>nothing</em>');
    expect(codes(value)).toContain(FUD_UNUSED);
  });
});
