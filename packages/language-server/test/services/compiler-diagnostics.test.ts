/**
 * The diagnostics the server reports for a document (SDD-24 §4.4).
 *
 * The point of the test is provenance: a parse error, an Oxc syntax error, a semantic rule of
 * SDD-12 and the server's own two rules must all arrive, with their spans, through one call.
 * An error the CLI reports and the editor does not is the failure this prevents.
 */

import { describe, expect, it } from 'vitest';
import { DocumentCache } from '../../src/document-cache.js';
import { WorkspaceIndex } from '../../src/workspace-index.js';
import {
  fudicDiagnostics,
  semanticDiagnostics,
} from '../../src/services/compiler-diagnostics.js';
import { component, LAYOUT, memoryFs, route } from '../_support.js';

const SLUG = '/p/blog/[slug].fud';

function setup(path: string, source: string) {
  const files: Record<string, string> = {
    '/p/components/app-badge.fud': component('app-badge'),
    '/p/layouts/_layout.fud': LAYOUT,
    [path]: source,
  };
  const index = new WorkspaceIndex(memoryFs(files));
  index.scan('/p');

  return { index, document: new DocumentCache(index).get(path, 1, source) };
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
    const source = `@code {\n  @client {\n    const = ;\n  }\n}\n${component('app-x')}`;

    expect(codesOf('/p/components/app-x.fud', source)).toContain('FUD0170');
  });

  it('adds FUD0460 for an href that resolves nowhere', () => {
    expect(codesOf(SLUG, route('../layouts/_layout.fud', ['../components/ghost.fud']))).toContain(
      'FUD0460',
    );
  });

  it('adds FUD0461 for a $ identifier in @client', () => {
    const source = `@code {\n  @client {\n    const $x = 1;\n  }\n}\n${component('app-x')}`;

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

  describe('FUD0704 / FUD0705 — the <body> of a layout, in the editor too (BUG-44 §3.4, criterion 6)', () => {
    const PATH = '/p/layouts/_articulo.fud';
    const layout = (head: string, body: string, bodyAttrs = ''): string =>
      `<!DOCTYPE html>\n<html lang="@culture">\n  <head>\n` +
      `    @code {\n      const { culture, seccion } = props<{ culture: string; seccion: string }>();\n    }\n` +
      `    ${head}\n    @RenderHead()\n  </head>\n  <body${bodyAttrs}>\n    ${body}\n    <main>@RenderBody()</main>\n  </body>\n</html>\n`;
    const on = (source: string): string[] => {
      const { index, document } = setup(PATH, source);
      return fudicDiagnostics(document, index)
        .filter((d) => d.code === 'FUD0704' || d.code === 'FUD0705')
        .map((d) => `${d.code}: ${source.slice(d.span.start, d.span.end)}`);
    };

    it('flags a prop read in an interpolation and in an attribute of the body, on the name', () => {
      expect(on(layout('', '<p>@seccion</p>'))).toEqual(['FUD0704: seccion']);
      expect(on(layout('', '<p title="@seccion">x</p>'))).toEqual(['FUD0704: seccion']);
      expect(on(layout('', '', ' data-x="@culture"'))).toEqual(['FUD0704: culture']);
    });

    it('flags control flow and any other expression in the body: only the two holes go there', () => {
      expect(on(layout('', '@if (seccion) {\n      <i>x</i>\n    }'))).toEqual(['FUD0705: @if']);
      expect(on(layout('', '<p>@(post.seccion)</p>'))).toEqual(['FUD0705: @(post.seccion)']);
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
