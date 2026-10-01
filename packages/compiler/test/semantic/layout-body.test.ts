/**
 * The `<body>` of a layout, in the semantic pass the editor runs (BUG-44, narrowed by SDD-48).
 *
 *   `FUD0705`  a `@{ }` block, at any depth of the body — and nothing else any more.
 *   `FUD0706`  retired by decision 136: a `@` inside any `<style>` is the CSS parser's `FUD0132`.
 *   `FUD0443`  a hole inside a construct of the layout, once per hole.
 *
 * `FUD0704` is retired (SDD-48 §4.1): the body reads its props like any markup does.
 */

import { describe, expect, it } from 'vitest';
import { parseDocument } from '../../src/html/index.js';
import { atConstructs } from '../../src/constructs.js';
import { structureDocument } from '../../src/document/index.js';
import { JsBatch, type FragmentId } from '../../src/oxc/index.js';
import type { Diagnostic, Node } from '../../src/types/index.js';
import { analyze, documentRoots, walk, type SemanticInput } from '../../src/semantic/index.js';

/** The semantic input the language server builds: every fragment it registers, batched once. */
function buildInput(source: string): SemanticInput {
  const html = parseDocument(source, { atConstructs }).value;
  const document = structureDocument(source, html).value;
  const batch = new JsBatch(source);
  const ids = new Map<Node, FragmentId>();

  walk(documentRoots(document), {
    interpolation(expr) {
      ids.set(expr, batch.add('expression', expr.expr));
    },
    binding(expr) {
      if (expr.expr.end > expr.expr.start) ids.set(expr, batch.add('expression', expr.expr));
    },
  });
  for (const part of document.code?.parts ?? []) {
    ids.set(part, batch.add('module-statements', part.js));
  }

  return {
    source,
    document,
    js: batch.parse().value,
    fragmentId: (node) => ids.get(node),
    components: { has: () => false },
  };
}

const RULES = new Set(['FUD0443', 'FUD0704', 'FUD0705']);

/** `code: text-under-the-span` for every diagnostic of the body rules. */
function flagged(source: string): string[] {
  return analyze(buildInput(source))
    .diagnostics.filter((d: Diagnostic) => RULES.has(d.code))
    .map((d) => `${d.code}: ${source.slice(d.span.start, d.span.end)}`);
}

const PROPS = 'const { culture, seccion, items } = props<{ culture: string; seccion: string; items: string[] }>();';

/** A layout declaring `code`, with `head` in its head, `body` in its body. */
const layout = (parts: { code?: string; head?: string; body?: string; hole?: string }): string =>
  '<!DOCTYPE html>\n<html lang="es">\n<head>\n' +
  `@code {\n  ${parts.code ?? PROPS}\n}\n` +
  `${parts.head ?? ''}\n@RenderHead()\n</head>\n` +
  `<body>\n${parts.body ?? ''}\n${parts.hole ?? '<main>@RenderBody()</main>'}\n</body>\n</html>\n`;

describe('the body of a layout is markup (criterion 2)', () => {
  it('reads its props in interpolations, attributes, bindings and `@raw`', () => {
    expect(
      flagged(
        layout({
          body:
            '<p title="@(culture)">@seccion @(seccion + culture) @raw(seccion)</p>\n' +
            '<app-marco .titulo=@seccion data-x="@culture"></app-marco>',
        }),
      ),
    ).toEqual([]);
  });

  it('writes components, `@render` and expressions that read no prop', () => {
    expect(flagged(layout({ body: '<app-marco></app-marco>\n@render pie(@seccion)\n<p>@(1 + 2)</p>' }))).toEqual(
      [],
    );
  });

  it('branches and loops over its props', () => {
    expect(
      flagged(
        layout({
          body:
            '@if (seccion) {\n  <i>@seccion</i>\n} else {\n  <b>x</b>\n}\n' +
            '@foreach (const i of items) key (i) {\n  <li>@i</li>\n}\n' +
            '@switch (culture) {\n  case "es": { <i>es</i> }\n}',
        }),
      ),
    ).toEqual([]);
  });
});

describe('FUD0705 — a `@{ }` block, at any depth', () => {
  it('straight in the body, over its `@{`, as an error', () => {
    const source = layout({ body: '@{ const x = 1; }' });
    const diagnostics = analyze(buildInput(source)).diagnostics.filter((d) => d.code === 'FUD0705');
    expect(diagnostics.map((d) => source.slice(d.span.start, d.span.end))).toEqual(['@{']);
    expect(diagnostics[0]!.severity).toBe('error');
  });

  it('inside an element and inside a construct', () => {
    expect(
      flagged(layout({ body: '<div>@{ let a = 1; }</div>\n@if (seccion) {\n  @{ let b = 2; }\n  <i>x</i>\n}' })),
    ).toEqual(['FUD0705: @{', 'FUD0705: @{']);
  });
});

describe('FUD0443 — a hole inside a construct (criterion 3)', () => {
  it('reports a `@RenderBody()` in an `@if`, over the hole', () => {
    const source = layout({ hole: '@if (seccion) {\n  <main>@RenderBody()</main>\n}' });
    const diagnostics = analyze(buildInput(source)).diagnostics.filter((d) => d.code === 'FUD0443');
    expect(diagnostics.map((d) => source.slice(d.span.start, d.span.end))).toEqual(['@RenderBody()']);
    expect(diagnostics[0]!.severity).toBe('error');
  });

  it('reports a section in a loop, and once when constructs nest', () => {
    expect(
      flagged(
        layout({
          body:
            '<nav>@foreach (const i of items) key (i) {\n  @RenderSection(nav)\n}</nav>\n' +
            '@if (seccion) {\n  @foreach (const i of items) key (i) {\n    <aside>@RenderSection(lateral)</aside>\n  }\n}',
        }),
      ),
    ).toEqual(['FUD0443: @RenderSection(nav)', 'FUD0443: @RenderSection(lateral)']);
  });

  it('says nothing of a hole beside a construct, or inside an element', () => {
    expect(
      flagged(layout({ body: '@if (seccion) {\n  <i>x</i>\n}\n<aside>@RenderSection(lateral)</aside>' })),
    ).toEqual([]);
  });
});

describe('decision 136 — a `@` in a layout’s `<style>` is the CSS parser’s `FUD0132`, not `FUD0706`', () => {
  /** `code: text-under-the-span` for every diagnostic of the parse and of the semantic pass. */
  const all = (source: string): string[] =>
    [...parseDocument(source, { atConstructs }).diagnostics, ...analyze(buildInput(source)).diagnostics]
      .filter((d) => d.code === 'FUD0132' || d.code === 'FUD0706')
      .map((d) => `${d.code}: ${source.slice(d.span.start, d.span.end)}`);

  it('in the head and in the body, each `@` is `FUD0132`, and the semantic pass says nothing', () => {
    const source = layout({
      head: '<style>:root { --c: @culture; }</style>',
      body: '<style>main { color: @(tone); }</style>',
    });
    expect(all(source)).toEqual(['FUD0132: @culture', 'FUD0132: @(tone)']);
    expect(flagged(source)).toEqual([]);
  });

  it('says nothing of a plain `<style>`', () => {
    expect(all(layout({ head: '<style>p { color: red }</style>' }))).toEqual([]);
  });
});

describe('what the rules leave alone', () => {
  it('markup, comments, an escaped `@@`, a script, a style and the holes', () => {
    expect(
      flagged(
        layout({
          body:
            '<nav class="site" hidden>a@@b</nav>\n<!-- c -->\n@* d *@\n' +
            '<script>var x = 1;</script>\n<style>p { color: red }</style>\n@RenderSection(nav)',
        }),
      ),
    ).toEqual([]);
  });

  it('a document that is not a layout', () => {
    const route =
      '<link rel="layout" href="./_layout.fud">\n@code {\n  const seccion = 1;\n}\n@{ let x = 1; }\n<p>@seccion</p>\n';
    expect(flagged(route)).toEqual([]);
  });
});
