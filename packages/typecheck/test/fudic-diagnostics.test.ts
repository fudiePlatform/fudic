/**
 * The diagnostics the server reports for a document (SDD-24 §4.4).
 *
 * The point of the test is provenance: a parse error, an Oxc syntax error, a semantic rule of
 * SDD-12 and the server's own two rules must all arrive, with their spans, through one call.
 * An error the CLI reports and the editor does not is the failure this prevents.
 */

import { describe, expect, it } from 'vitest';
import {
  fudicDiagnostics,
  hrefDiagnostics,
  linksOf,
  missingSections,
  semanticDiagnostics,
  unresolvedHrefs,
} from '../src/index.js';
import { describeFud, FudIndex } from '../src/fud-index.js';
import { projectFud } from '../src/project.js';
import { component, LAYOUT, memoryFs, projected, route } from './_support.js';

const SLUG = '/p/blog/[slug].fud';

function setup(path: string, source: string) {
  return projected(path, source, {
    '/p/components/app-badge.fud': component('app-badge'),
    '/p/layouts/_layout.fud': LAYOUT,
  });
}

const codesOf = (path: string, source: string): readonly string[] => {
  const { index, document } = setup(path, source);
  return fudicDiagnostics(document, index).map((diagnostic) => diagnostic.code);
};

describe('semanticDiagnostics', () => {
  it('runs SDD-12 over the AST the cache already holds', () => {
    // A custom tag with no `<link>` is FUD0191 — the analyzer needs the injected registry.
    const source = `<app-x>\n  <template shadowrootmode="open"><app-ghost></app-ghost></template>\n</app-x>\n`;
    const { document } = setup('/p/components/app-x.fud', source);

    expect(semanticDiagnostics(document).map((diagnostic) => diagnostic.code)).toContain('FUD0191');
  });

  it('resolves the Oxc fragment of an interpolation, which is what SDD-12 asks it for', () => {
    // FUD0195 (decision 19): an object literal interpolated. Reachable only through
    // `fragmentId` — the analyzer needs the AST of that one expression.
    const source = `<app-x>
  <template shadowrootmode="open"><i>@({ a: 1 })</i></template>
</app-x>
`;
    const { document } = setup('/p/components/app-x.fud', source);

    expect(semanticDiagnostics(document).map((diagnostic) => diagnostic.code)).toContain('FUD0195');
  });

  it('says nothing about a tag this file did declare', () => {
    const source = `<link rel="component" href="./app-badge.fud">\n<app-x>\n  <template shadowrootmode="open"><app-badge></app-badge></template>\n</app-x>\n`;
    const { document } = setup('/p/components/app-x.fud', source);

    expect(semanticDiagnostics(document).map((diagnostic) => diagnostic.code)).not.toContain(
      'FUD0191',
    );
  });
});

describe('fudicDiagnostics', () => {
  it('is silent on a document that is right', () => {
    expect(
      codesOf(SLUG, route('../layouts/_layout.fud', ['../components/app-badge.fud'])),
    ).toEqual([]);
  });

  it('forwards a parse error', () => {
    expect(codesOf('/p/components/app-x.fud', '<div><app-x>\n').length).toBeGreaterThan(0);
  });

  it('forwards an Oxc syntax error', () => {
    const source = `@code {\n  const = ;\n}\n${component('app-x')}`;

    expect(codesOf('/p/components/app-x.fud', source)).toContain('FUD0170');
  });

  it('adds FUD0460 for an href that resolves nowhere', () => {
    expect(codesOf(SLUG, route('../layouts/_layout.fud', ['../components/ghost.fud']))).toContain(
      'FUD0460',
    );
  });

  it('adds FUD0461 for a $ identifier in @code', () => {
    const source = `@code {\n  const $x = 1;\n}\n${component('app-x')}`;

    expect(codesOf('/p/components/app-x.fud', source)).toContain('FUD0461');
  });

  it('forwards FUD0438: a framework link below the top level, in the editor too', () => {
    // It has to be seen HERE and not only in a build. Nested, the link registers nothing —
    // the tag renders empty — and it used to publish the `.fud` it named into the page. A
    // mistake that silent is one the editor has to underline while it is being typed.
    const source =
      '<link rel="layout" href="../layouts/_layout.fud">\n' +
      '<head><link rel="component" href="../components/app-badge.fud"><title>t</title></head>\n' +
      '<app-badge></app-badge>\n';

    expect(codesOf(SLUG, source)).toContain('FUD0438');
  });

  describe('the <body> of a layout, in the editor too (BUG-44 §3.4 as SDD-48 §4.1–§4.2 narrowed it)', () => {
    const PATH = '/p/layouts/_articulo.fud';
    const layout = (head: string, body: string, bodyAttrs = '', hole = '<main>@RenderBody()</main>'): string =>
      `<!DOCTYPE html>\n<html lang="@culture">\n  <head>\n` +
      `    @code {\n      const { culture, seccion } = props<{ culture: string; seccion: string }>();\n    }\n` +
      `    ${head}\n    @RenderHead()\n  </head>\n  <body${bodyAttrs}>\n    ${body}\n    ${hole}\n  </body>\n</html>\n`;
    const on = (source: string): string[] => {
      const { index, document } = setup(PATH, source);
      return fudicDiagnostics(document, index)
        .filter((d) => ['FUD0893', 'FUD0704', 'FUD0705'].includes(d.code))
        .map((d) => `${d.code}: ${source.slice(d.span.start, d.span.end)}`);
    };

    it('lets the body read its props and branch, as the build does (criterion 2)', () => {
      expect(on(layout('', '<p title="@seccion">@seccion</p>', ' data-x="@culture"'))).toEqual([]);
      expect(on(layout('', '@if (seccion) {\n      <i>x</i>\n    }\n    <p>@(seccion.length)</p>'))).toEqual([]);
    });

    it('flags a `@{ }` (FUD0705) and a hole inside a construct (FUD0893)', () => {
      expect(on(layout('', '<div>@{ let a = 1; }</div>'))).toEqual(['FUD0705: @{']);
      expect(on(layout('', '', '', '@if (seccion) {\n      <main>@RenderBody()</main>\n    }'))).toEqual([
        'FUD0893: @RenderBody()',
      ]);
    });

    it('flags a binding in a `<style>` of the layout as Razor in plain CSS (FUD0132)', () => {
      // Decision 136: a `<style>` body is plain CSS everywhere, so the layout's own FUD0706
      // is retired and the parser's FUD0132 is what the editor publishes.
      const source = layout('<style>:root { --s: @seccion; }</style>', '<p>x</p>');
      const { index, document } = setup(PATH, source);
      const diagnostics = fudicDiagnostics(document, index);
      const style = diagnostics.filter((d) => d.code === 'FUD0132');
      expect(style.map((d) => source.slice(d.span.start, d.span.end))).toEqual(['@seccion']);
      expect(diagnostics.map((d) => d.code)).not.toContain('FUD0706');
    });

    it('says nothing in `<html>`, in the head, or of the two holes', () => {
      expect(
        on(layout('<meta property="article:section" content="@seccion">', '@RenderSection(nav)')),
      ).toEqual([]);
    });
  });

  it('keeps every diagnostic on a span of the .fud', () => {
    const source = route('../layouts/_layout.fud', ['../components/ghost.fud']);
    const { index, document } = setup(SLUG, source);

    for (const diagnostic of fudicDiagnostics(document, index)) {
      expect(diagnostic.span.start).toBeGreaterThanOrEqual(0);
      expect(diagnostic.span.end).toBeLessThanOrEqual(source.length);
    }
  });
});

describe('the links and holes the rules read', () => {
  it('leaves FUD0460 to an href that is there: none for a link with no href or an empty one', () => {
    const source =
      '<link rel="layout" href="../layouts/_layout.fud">\n<link rel="component">\n<link rel="component" href="">\n<article>hi</article>\n';
    const { index, document } = setup(SLUG, source);

    expect(unresolvedHrefs(document, index)).toEqual([]);
    expect(hrefDiagnostics(document, index)).toEqual([]);
  });

  it('names the fix of a package specifier that resolves to nothing (FUD0760)', () => {
    const source = route('@shop/ui/layouts/main.fud', ['@nobody/ui/card.fud']);
    const index = new FudIndex(
      memoryFs({ [SLUG]: source }, {}, { '@shop/ui/layouts/main.fud': 'not-exported', '@nobody/ui/card.fud': 'not-installed' }),
      describeFud,
    );
    index.scan('/p');
    const document = projectFud({ path: SLUG, source, index });

    const diagnostics = hrefDiagnostics(document, index);
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0760', 'FUD0760']);
    expect(diagnostics.map((d) => source.slice(d.span.start, d.span.end)).sort()).toEqual([
      '@nobody/ui/card.fud',
      '@shop/ui/layouts/main.fud',
    ]);
    const messages = diagnostics.map((d) => d.message).join('\n');
    expect(messages).toContain('the package "@shop/ui" is installed but does not publish "@shop/ui/layouts/main.fud"');
    expect(messages).toContain('"@nobody/ui/card.fud" names a package that is not installed');
    expect(diagnostics.every((d) => !('file' in d))).toBe(true);
  });

  it('says where the file of an unresolved href would have to be created', () => {
    const { index, document } = setup(SLUG, route('../layouts/_layout.fud', ['../components/ghost.fud']));

    expect(unresolvedHrefs(document, index).map((unresolved) => unresolved.target)).toEqual([
      '/p/components/ghost.fud',
    ]);
  });

  it("reads a nested layout's own <link rel=\"layout\">, and a snippet import", () => {
    const nested = LAYOUT.replace('<meta charset="utf-8">', '<link rel="layout" href="./_root.fud">\n    <meta charset="utf-8">');
    const { document } = setup('/p/layouts/_nested.fud', nested);
    expect(linksOf(document.document).map((link) => link.rel)).toEqual(['layout']);

    const withSnippets = `<link rel="snippet" href="./ui.fud">\n${component('app-x')}`;
    expect(linksOf(setup('/p/components/app-x.fud', withSnippets).document.document).map((link) => link.rel)).toEqual([
      'snippet',
    ]);
  });

  it('lists the required sections a route leaves unfilled, and none for what is not a route', () => {
    const layout = LAYOUT.replace('@RenderHead()', '@RenderHead()\n    @RenderSection(nav, required: true)');
    const files = { '/p/layouts/_layout.fud': layout };

    const bare = projected(SLUG, route('../layouts/_layout.fud'), files);
    expect(missingSections(bare.document, bare.index).map((section) => section.name)).toEqual(['nav']);

    const filled = projected(SLUG, `${route('../layouts/_layout.fud')}@section nav {\n  <i>x</i>\n}\n`, files);
    expect(missingSections(filled.document, filled.index)).toEqual([]);

    const notRoute = projected('/p/components/app-x.fud', component('app-x'), files);
    expect(missingSections(notRoute.document, notRoute.index)).toEqual([]);

    const unknownLayout = projected(SLUG, route('../layouts/ghost.fud'), files);
    expect(missingSections(unknownLayout.document, unknownLayout.index)).toEqual([]);
  });
});

describe('the <link rel="server"> (SDD-60 §3.14)', () => {
  const ROUTE = '/p/src/routes/r.fud';
  const source = [
    '<link rel="server" href="./r.fudapi">',
    '<link rel="server" href="./ghost.fudapi">',
    '<link rel="server" href="./r.ts">',
    component('p-r'),
  ].join('\n');
  const files = { '/p/src/routes/r.fudapi': 'get search\n' };

  it('is a link of the file, with rel server', () => {
    const { document } = projected(ROUTE, source, files);
    expect(linksOf(document.document).map((link) => link.rel)).toEqual(['server', 'server', 'server']);
  });

  it('a .fudapi that is not there is FUD1111 over the whole link, as the build says it', () => {
    const { index, document } = projected(ROUTE, source, files);
    const unresolved = unresolvedHrefs(document, index);
    // `./r.ts` is the structure's FUD1111 (not a `.fudapi`), never a missing file.
    expect(unresolved.map((u) => [u.href, u.target, u.link.rel])).toEqual([
      ['./ghost.fudapi', '/p/src/routes/ghost.fudapi', 'server'],
    ]);
    const [diagnostic] = hrefDiagnostics(document, index);
    expect(diagnostic?.code).toBe('FUD1111');
    expect(source.slice(diagnostic?.span.start, diagnostic?.span.end)).toBe('<link rel="server" href="./ghost.fudapi">');
  });

  it('an index that cannot read contracts leaves them be', () => {
    const { index, document } = projected(ROUTE, source, files);
    const blind = { resolve: index.resolve.bind(index), failure: index.failure.bind(index) };
    expect(unresolvedHrefs(document, blind)).toEqual([]);
  });

  it('says where an href points, there or not', () => {
    const { index } = projected(ROUTE, source, files);
    expect(index.serverPath(ROUTE, './ghost.fudapi')).toBe('/p/src/routes/ghost.fudapi');
  });
});

describe('the names a linked .fudapi gives the view (SDD-60 §3.14)', () => {
  const PATH = '/p/src/components/p-f.fud';
  const files = {
    '/p/src/components/p-f.fudapi': 'put save\n  form personForm\n',
    '/p/src/forms/person.fudapi': 'form personForm\n  name  str = ""\n',
  };
  const view = (links: string): string =>
    `${links}\n<p-f>\n  <template shadowrootmode="open"><form control=@personForm form:=@save></form>@data</template>\n</p-f>\n`;
  const unknown = (source: string): readonly string[] =>
    semanticDiagnostics(projected(PATH, source, files).document)
      .filter((d) => d.code === 'FUD0907')
      .map((d) => source.slice(d.span.start, d.span.end));

  it('its functions and the forms they take are names of the view; `data` is not, without load', () => {
    expect(unknown(view('<link rel="server" href="./p-f.fudapi">'))).toEqual(['data']);
  });

  it('a link that cannot be read tells nothing: the names stay unknown, and a component has no `data`', () => {
    expect(unknown(view('<link rel="server" href="./ghost.fudapi">'))).toEqual(['personForm', 'save', 'data']);
  });
});
