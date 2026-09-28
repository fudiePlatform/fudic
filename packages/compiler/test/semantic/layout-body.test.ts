/**
 * BUG-44 §3.4 — the `<body>` of a layout, in the semantic pass the editor runs.
 *
 *   `FUD0704`  a layout prop read in the body, its own attributes included.
 *   `FUD0705`  any other construct there: only `@RenderBody()` and `@RenderSection()` may be
 *              written in a layout's body.
 *
 * The analyzer is fed the fragments the language server's batch registers: interpolations,
 * attribute values and the headers of `@foreach` / `@for`.
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
    // An empty `@()` registers nothing, as in the editor: the wrapper alone is not JS.
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

/** `code: text-under-the-span` for every diagnostic of the rule. */
function flagged(source: string): string[] {
  return analyze(buildInput(source))
    .diagnostics.filter((d: Diagnostic) => d.code === 'FUD0704' || d.code === 'FUD0705')
    .map((d) => `${d.code}: ${source.slice(d.span.start, d.span.end)}`);
}

const PROPS = 'const { culture, seccion } = props<{ culture: string; seccion: string }>();';

/** A layout declaring `code`, with `head` in its head, `body` in its body. */
const layout = (parts: {
  code?: string;
  head?: string;
  body?: string;
  html?: string;
  bodyAttrs?: string;
}): string =>
  '<!DOCTYPE html>\n' +
  `<html ${parts.html ?? 'lang="es"'}>\n<head>\n` +
  `@code {\n  ${parts.code ?? PROPS}\n}\n` +
  `${parts.head ?? ''}\n@RenderHead()\n</head>\n` +
  `<body${parts.bodyAttrs ?? ''}>\n${parts.body ?? ''}\n<main>@RenderBody()</main>\n</body>\n</html>\n`;

describe('FUD0704 — a prop read in the body', () => {
  it('in an interpolation, on the name', () => {
    expect(flagged(layout({ body: '<p>@seccion</p>' }))).toEqual(['FUD0704: seccion']);
  });

  it('in an attribute value', () => {
    expect(flagged(layout({ body: '<p title="@(culture)">x</p>' }))).toEqual(['FUD0704: culture']);
  });

  it('in an attribute of the `<body>` itself', () => {
    expect(flagged(layout({ bodyAttrs: ' data-x="@culture"' }))).toEqual(['FUD0704: culture']);
  });

  it('in `@raw( … )`', () => {
    expect(flagged(layout({ body: '<p>@raw(seccion)</p>' }))).toEqual(['FUD0704: seccion']);
  });

  it('every read of one expression, each on its own name, and as an error', () => {
    const source = layout({ body: '<p>@(seccion + culture)</p>' });
    const diagnostics = analyze(buildInput(source)).diagnostics.filter((d) => d.code === 'FUD0704');
    expect(diagnostics.map((d) => source.slice(d.span.start, d.span.end))).toEqual(['seccion', 'culture']);
    expect(diagnostics[0]!.severity).toBe('error');
    expect(diagnostics[0]!.message).toContain('`seccion`');
  });

  it('not a name a lambda declares', () => {
    expect(flagged(layout({ body: '<p>@(xs.map((seccion) => seccion))</p>' }))).toEqual([
      'FUD0705: @(xs.map((seccion) => seccion))',
    ]);
  });
});

describe('FUD0705 — only the two holes may be written in the body', () => {
  it('control flow, over its `@keyword`, without looking inside it', () => {
    expect(flagged(layout({ body: '@if (seccion) {\n  <i>@seccion</i>\n}' }))).toEqual(['FUD0705: @if']);
    expect(
      flagged(layout({ body: '@foreach (const seccion of items) {\n  <i>@seccion</i>\n}' })),
    ).toEqual(['FUD0705: @foreach']);
  });

  it('an expression that reads no prop, over the whole of it', () => {
    expect(flagged(layout({ body: '<p>@(post.seccion)</p>' }))).toEqual([
      'FUD0705: @(post.seccion)',
    ]);
  });

  it('an empty `@()`, which has no AST to read a prop from', () => {
    expect(flagged(layout({ body: '<p title="@()">x</p>' }))).toEqual(['FUD0705: @()']);
  });

  it('a `@render` of a snippet', () => {
    expect(flagged(layout({ body: '@render card()' }))).toEqual(['FUD0705: @render']);
  });
});

describe('FUD0706 — no `<style>` of a layout takes a binding', () => {
  const styled = (d: Diagnostic[] | readonly Diagnostic[], source: string): string[] =>
    d.filter((x) => x.code === 'FUD0706').map((x) => source.slice(x.span.start, x.span.end));
  const of = (source: string): string[] => styled(analyze(buildInput(source)).diagnostics, source);

  it('in the head and in the body, over each `@`, whatever it reads', () => {
    const source = layout({
      head: '<style>:root { --c: @culture; }</style>',
      body: '<style>main { color: @(tone); }</style>',
    });
    expect(of(source)).toEqual(['@culture', '@(tone)']);
    // The body's `<style>` is this rule's alone: no second voice from `FUD0704`/`FUD0705`.
    expect(flagged(source)).toEqual([]);
  });

  it('says nothing of a plain `<style>`, or of an escaped `@@`', () => {
    expect(of(layout({ head: '<style>p { color: red } @@x {}</style>' }))).toEqual([]);
  });
});

describe('what the rule leaves alone', () => {
  it('`<html>` and the head, anywhere in it', () => {
    expect(
      flagged(
        layout({
          html: 'lang="@culture"',
          head: '<meta property="article:section" content="@seccion">\n<title>@seccion</title>',
        }),
      ),
    ).toEqual([]);
  });

  it('markup, comments, an escaped `@@`, a script, a style and the two holes', () => {
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

  it('flags a prop named by a `bus:( … )` attribute, the one name that is an expression', () => {
    expect(flagged(layout({ body: '<p bus:(seccion)="@h">x</p>' }))).toEqual([
      'FUD0704: seccion',
      'FUD0705: @h',
    ]);
  });

  it('a `@RenderHead()` or a `@section` in the body, which have their own voice', () => {
    expect(flagged(layout({ body: '@RenderHead()' }))).toEqual([]);
    expect(flagged(layout({ body: '@section nav {\n  <i>x</i>\n}' }))).toEqual([]);
  });

  it('a document that is not a layout', () => {
    const route = '<link rel="layout" href="./_layout.fud">\n@code {\n  const seccion = 1;\n}\n<p>@seccion</p>\n';
    expect(flagged(route)).toEqual([]);
  });
});

describe('what counts as a prop: every name the neutral zone declares', () => {
  it('sees through defaults, rests and array patterns, holes included', () => {
    const code =
      'const { culture = "es", ...rest } = props<{ culture?: string; a: string }>();\n' +
      'const [first, , third, ...others] = [1, 2, 3, 4];';
    expect(flagged(layout({ code, body: '<p>@culture @rest @first @third @others</p>' }))).toEqual([
      'FUD0704: culture',
      'FUD0704: rest',
      'FUD0704: first',
      'FUD0704: third',
      'FUD0704: others',
    ]);
  });

  it('sees through a nested pattern and a default inside an array', () => {
    const code = 'const { a: { b }, c: [d = 1] } = props<{ a: { b: string }; c: number[] }>();';
    expect(flagged(layout({ code, body: '<p>@b @d</p>' }))).toEqual(['FUD0704: b', 'FUD0704: d']);
  });

  it('counts a loose `const` as declared, and skips a declaration that is not a variable', () => {
    const code = `type Props = { a: string };\n  ${PROPS}\n  const loose = 1;`;
    expect(flagged(layout({ code, body: '<p>@loose</p>' }))).toEqual(['FUD0704: loose']);
  });

  it('ignores a `@server` region: it declares no prop (that is `FUD0700`)', () => {
    const code = `${PROPS}\n  @server {\n    const hidden = 1;\n  }`;
    expect(flagged(layout({ code, body: '<p>@hidden</p>' }))).toEqual(['FUD0705: @hidden']);
  });

  it('declares nothing in a layout with no `@code`', () => {
    const source = layout({ body: '<p>@seccion</p>' }).replace(`@code {\n  ${PROPS}\n}\n`, '');
    expect(flagged(source)).toEqual(['FUD0705: @seccion']);
  });
});
