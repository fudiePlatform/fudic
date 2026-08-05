/**
 * SDD-28 criteria 3 and 6 — every body compiles.
 *
 * A snippet that hands over a file the compiler rejects is worse than no snippet: the user
 * accepted a suggestion and got an error for it. So each body is materialized —every tabstop
 * replaced by its default— and put through the real parser, at the position the catalogue
 * itself says it belongs to.
 */

import { describe, expect, it } from 'vitest';
import { parseFud } from '../../src/parse.js';
import { SNIPPETS, type FudSnippet } from '../../src/services/snippets.js';

/**
 * The body as the editor would leave it if the user pressed Tab through it without typing:
 * `${1:x}` becomes `x`, `${1}` and `$0` become nothing.
 *
 * The three forms are replaced by three expressions on purpose. One pattern with an optional
 * brace (`\$\{?\d+\}?`) eats the closing brace of `@client {$0}` and produces a body that
 * looks unbalanced — which is how this test first failed, on itself rather than on the
 * catalogue.
 */
function materialize(body: string): string {
  return body
    .replace(/\$\{\d+:([^}]*)\}/gu, '$1')
    .replace(/\$\{\d+\}/gu, '')
    .replace(/\$\d+/gu, '');
}

/** Codes of everything the parser had to say, errors and warnings alike. */
function codes(source: string): readonly string[] {
  return parseFud(source).diagnostics.map((diagnostic) => diagnostic.code);
}

const of = (label: string, scope: FudSnippet['scope']): FudSnippet =>
  SNIPPETS.find((s) => s.label === label && s.scope === scope) as FudSnippet;

const skeletons = SNIPPETS.filter((snippet) => snippet.scope === 'empty-document');

describe('the skeletons parse as their role, with nothing to report', () => {
  it.each([
    ['component', 'component-document'],
    ['route', 'route-document'],
    ['page', 'page-document'],
    ['layout', 'layout-document'],
  ])('%s is a %s', (label, type) => {
    const source = materialize(of(label, 'empty-document').body);
    const parsed = parseFud(source);

    expect(parsed.document.type).toBe(type);
    expect(parsed.diagnostics.map((d) => `${d.code} ${d.message}`)).toEqual([]);
  });

  it('covers the four of them', () => {
    expect(skeletons.map((snippet) => snippet.label)).toEqual(['component', 'route', 'page', 'layout']);
  });
});

describe('the markup bodies parse where they are offered', () => {
  /** A component with `body` inside its template, which is where markup snippets land. */
  const inTemplate = (body: string): string =>
    `<app-x>\n  <template shadowrootmode="open">\n${body}\n  </template>\n</app-x>\n`;

  const markup = SNIPPETS.filter(
    (snippet) => snippet.scope === 'markup' && snippet.placement === undefined,
  );

  it.each(markup.filter((s) => s.roles === undefined).map((s) => [s.label, s.body] as const))(
    '%s',
    (_label, body) => {
      expect(codes(inTemplate(materialize(body)))).toEqual([]);
    },
  );

  it('a layout directive parses inside its layout', () => {
    const source = `<!DOCTYPE html>
<html lang="es">
  <head>
    ${materialize(of('@RenderHead', 'markup').body)}
  </head>
  <body>
    ${materialize(of('@RenderSection', 'markup').body)}
    <main>${materialize(of('@RenderBody', 'markup').body)}</main>
  </body>
</html>
`;
    expect(codes(source)).toEqual([]);
  });

  it('a @section parses at top level of its route', () => {
    const source = `<link rel="layout" href="./_layout.fud">

${materialize(of('@section', 'markup').body)}

<h1>hi</h1>
`;
    expect(codes(source)).toEqual([]);
  });
});

describe('the @code bodies parse where they are offered', () => {
  const codeOf = (role: string): string =>
    materialize(
      (SNIPPETS.find(
        (s) => s.label === '@code' && s.scope === 'markup' && s.roles?.includes(role as never) === true,
      ) as FudSnippet).body,
    );

  it('a component takes it at top level', () => {
    const source = `${codeOf('component')}\n<app-x>\n  <template shadowrootmode="open"></template>\n</app-x>\n`;
    expect(codes(source)).toEqual([]);
  });

  it('a route takes it at top level', () => {
    const source = `<link rel="layout" href="./_layout.fud">\n${codeOf('route')}\n<h1>hi</h1>\n`;
    expect(codes(source)).toEqual([]);
  });

  it('a page takes it inside <head>', () => {
    const source = `<!DOCTYPE html>
<html lang="es">
  <head>
    <title>hi</title>
${codeOf('page')}
  </head>
  <body><h1>hi</h1></body>
</html>
`;
    expect(codes(source)).toEqual([]);
  });

  it('a layout takes it inside <head>', () => {
    const source = `<!DOCTYPE html>
<html lang="es">
  <head>
${codeOf('layout')}
    @RenderHead()
  </head>
  <body><main>@RenderBody()</main></body>
</html>
`;
    expect(codes(source)).toEqual([]);
  });
});

describe('every $ belongs to a tabstop (criterion of §9)', () => {
  /** What is left of a body once its tabstops are removed. */
  const withoutTabstops = (body: string): string =>
    body.replace(/\$\{\d+:[^}]*\}/gu, '').replace(/\$\{\d+\}/gu, '').replace(/\$\d+/gu, '');

  it.each(SNIPPETS.map((snippet) => [snippet.label, snippet.scope, snippet.body] as const))(
    '%s (%s) has no stray $ and no stray backslash',
    (_label, _scope, body) => {
      // A `$` the editor does not read as a tabstop is inserted mutilated, and no other test
      // here would see it: every assertion above materializes the tabstops away first.
      expect(withoutTabstops(body)).not.toContain('$');
      expect(body).not.toContain('\\');
    },
  );

  it('bites: a body with a bare $ is caught', () => {
    expect(withoutTabstops('const price = $total;')).toContain('$');
  });
});

describe('the zones parse inside a @code', () => {
  it('props and @client, in a component', () => {
    const source = `@code {
${materialize(of('props', 'code-block').body)}

${materialize(of('@client', 'code-block').body)}
}
<app-x>
  <template shadowrootmode="open"></template>
</app-x>
`;
    expect(codes(source)).toEqual([]);
  });

  it('@server with a load inside it, in a route', () => {
    const load = materialize(of('load', 'code-block').body);
    const source = `<link rel="layout" href="./_layout.fud">
@code {
  type PageData = { title: string };

  @server {
${load}
  }
}
<h1>hi</h1>
`;
    expect(codes(source)).toEqual([]);
  });
});
