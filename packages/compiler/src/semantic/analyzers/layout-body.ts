/**
 * The `<body>` of a LAYOUT writes markup and two holes, and nothing else (BUG-44).
 *
 * A layout owns the shell. What differs from route to route in the body already has its own
 * mechanism: the route fills a hole — `@RenderBody()` with its markup, `@RenderSection(name)`
 * with a `@section` of its own, the way `site-nav` is. Everything else a `@` could write there
 * is a second, hidden path for the same thing, and the page ends up painted half by the route
 * and half by the layout:
 *
 *   `FUD0704`  a layout PROP read in the body, its own attributes included. A layout's props
 *              are bindings of the HEAD — the `<html lang>`, a `<meta>` — and never of the body.
 *   `FUD0705`  any other construct in the body: control flow, an expression, a `@{ }`, a
 *              snippet. Only `@RenderBody()` and `@RenderSection()` may be written there.
 *   `FUD0706`  a `@` inside any `<style>` of the layout, head or body: its CSS is the shell's.
 *
 * ONE rule and two callers. The editor runs only the semantic pass, and the build reads the
 * layout's diagnostics off its emit; `layoutBodyDiagnostics` is what both of them call, so the
 * two cannot disagree about what the body may hold.
 *
 * A read is found by FREE references, not by text: `@(post.seccion)` reads `post`, and a name a
 * lambda declares is its own. Each expression is read on its own: no construct in the body may
 * declare a name, so there is no scope one fragment could open for the next.
 */

import type { OxcNode } from '../../oxc/index.js';
import type { Diagnostic } from '../../types/index.js';
import { errorDiag, span } from '../../types/index.js';
import type { RazorExpression } from '../../at/index.js';
import type { ElementNode, HtmlContent, RawExpressionNode } from '../../html/index.js';
import { freeReferenceNodes, type FragmentAst } from '../../emit/scope.js';
import type { Analyzer } from '../model.js';

const FUD_LAYOUT_PROP_IN_BODY = 'FUD0704';
const FUD_LAYOUT_BODY_CONSTRUCT = 'FUD0705';
const FUD_LAYOUT_STYLE_BINDING = 'FUD0706';

/**
 * What the two callers supply: the AST of one expression, and the way back to the `.fud`.
 *
 * `astOf` answers `undefined` for an expression that was never parsed — an empty `@()` — and
 * `toSource` maps an Oxc offset, a BUFFER coordinate, back onto the source.
 */
export interface LayoutBodyJs {
  readonly astOf: (expr: RazorExpression) => FragmentAst | undefined;
  readonly toSource: (bufferOffset: number) => number;
}

/**
 * Nodes the body may hold without a word from this rule.
 *
 * The two holes, and what writes no code: text, comments, an escaped `@@`, the opaque body of
 * a `<script>` or a `<style>`. `@RenderHead()` and `@section` are misplaced here too, but each
 * already has its own diagnostic (`FUD0431`, `FUD0427`), and a second one on the same
 * construct would only repeat it; so has a construct the parser could not read (`FUD0055`).
 */
const SILENT: ReadonlySet<string> = new Set([
  'text',
  'comment',
  'razor-comment',
  'at-escape',
  'doctype',
  'cdata',
  'raw-text',
  'style-content',
  'render-body',
  'render-section',
  'render-head',
  'section',
  'unhandled-construct',
]);

/** Every diagnostic of a layout's `<body>`: its own attributes, then its content. */
export function layoutBodyDiagnostics(
  source: string,
  body: ElementNode,
  props: ReadonlySet<string>,
  js: LayoutBodyJs,
): readonly Diagnostic[] {
  const out: Diagnostic[] = [];
  element(source, body, props, js, out);
  return out;
}

function element(
  source: string,
  el: ElementNode,
  props: ReadonlySet<string>,
  js: LayoutBodyJs,
  out: Diagnostic[],
): void {
  for (const attribute of el.attributes) {
    if (typeof attribute.name !== 'string') expression(attribute.name, props, js, out);
    for (const part of attribute.value) {
      if (part.type === 'razor-expression') expression(part, props, js, out);
    }
  }
  for (const child of el.children) content(source, child, props, js, out);
}

function content(
  source: string,
  node: HtmlContent,
  props: ReadonlySet<string>,
  js: LayoutBodyJs,
  out: Diagnostic[],
): void {
  if (node.type === 'element') {
    element(source, node, props, js, out);
    return;
  }
  if (node.type === 'razor-expression') {
    expression(node, props, js, out);
    return;
  }
  if (node.type === 'raw-expression') {
    expression((node as RawExpressionNode).expr, props, js, out);
    return;
  }
  if (SILENT.has(node.type)) return;
  // A construct: control flow, `@{ }`, `@render`, a `@snippet`. Reported once, over its
  // opening `@keyword`, and not descended — whatever is inside it is inside the construct
  // that should not be there.
  out.push(
    errorDiag(
      FUD_LAYOUT_BODY_CONSTRUCT,
      "the <body> of a layout writes markup, `@RenderBody()` and `@RenderSection()` and nothing else: what changes from route to route is the route's to write, in a `@section`",
      span(node.span.start, node.span.start + opening(source, node.span.start)),
    ),
  );
}

/**
 * The length of the `@keyword` — or `@{` — that opens a construct at `at`.
 *
 * Every node that reaches here is one: what is left of `HtmlContent` once `SILENT`, the
 * elements and the expressions are out is a `@`-construct, and each is spelled `@` + its
 * keyword or `@{`. So the match is always there.
 */
function opening(source: string, at: number): number {
  return (/^@(?:[A-Za-z]+|\{)/u.exec(source.slice(at)) as RegExpExecArray)[0].length;
}

/**
 * One expression of the body: `FUD0704` over every prop it reads, or `FUD0705` over the whole
 * expression when it reads none — an expression is a construct the body may not write either.
 */
function expression(
  expr: RazorExpression,
  props: ReadonlySet<string>,
  js: LayoutBodyJs,
  out: Diagnostic[],
): void {
  const ast = js.astOf(expr);
  const reads = ast === undefined ? [] : propReads(props, ast);
  if (reads.length > 0) {
    for (const node of reads) {
      out.push(
        errorDiag(
          FUD_LAYOUT_PROP_IN_BODY,
          `the layout prop \`${node['name'] as string}\` is read in the <body>: a layout's props are bindings of the head — <html>, <head> and what is inside it — and what differs from route to route in the body is the route's to write, in a \`@section\``,
          span(js.toSource(node.start), js.toSource(node.end)),
        ),
      );
    }
    return;
  }
  out.push(
    errorDiag(
      FUD_LAYOUT_BODY_CONSTRUCT,
      "the <body> of a layout writes no expression: it holds markup, `@RenderBody()` and `@RenderSection()`, and what changes from route to route is the route's to write, in a `@section`",
      expr.span,
    ),
  );
}

/**
 * `FUD0706` — a `@` inside a `<style>` of a LAYOUT, head or body alike (BUG-44).
 *
 * A layout's CSS is the shell's, the same for every route, and a binding there would make it
 * the one stylesheet that changes with the page. What changes from route to route is the
 * route's to style. Structural — the `@` is there or it is not — so it needs no AST, and each
 * one is reported over itself.
 */
export function layoutStyleDiagnostics(html: ElementNode): readonly Diagnostic[] {
  const out: Diagnostic[] = [];
  const visit = (el: ElementNode): void => {
    for (const child of el.children) {
      if (child.type === 'element') visit(child);
      if (child.type !== 'style-content') continue;
      for (const part of child.parts) {
        if (part.type !== 'razor-expression') continue;
        out.push(
          errorDiag(
            FUD_LAYOUT_STYLE_BINDING,
            "a layout's <style> takes no binding: its CSS is the shell's, the same for every route, and what changes from route to route is the route's to style",
            part.span,
          ),
        );
      }
    }
  };
  visit(html);
  return out;
}

/** The free references of one expression that name a prop, in source order. */
function propReads(props: ReadonlySet<string>, ast: FragmentAst): readonly OxcNode[] {
  return freeReferenceNodes([ast]).filter((node) => props.has(node['name'] as string));
}

export const layoutBody: Analyzer = {
  name: 'layout-body',
  run(input, report) {
    const document = input.document;
    if (document.type !== 'layout-document') return;

    // What the neutral zone declares IS the props: anything else there is `FUD0700`, and a
    // name it declares is one the body may not read either way.
    const props = new Set<string>();
    for (const part of document.code?.parts ?? []) {
      const id = part.type === 'neutral-js' ? input.fragmentId(part) : undefined;
      if (id === undefined) continue;
      for (const statement of input.js.ast(id) as readonly OxcNode[]) declaredNames(statement, props);
    }

    const js: LayoutBodyJs = {
      astOf: (expr) => {
        const id = input.fragmentId(expr);
        return id === undefined ? undefined : input.js.ast(id);
      },
      toSource: input.js.mapOffset,
    };
    for (const d of layoutBodyDiagnostics(input.source, document.body, props, js)) report(d);
    for (const d of layoutStyleDiagnostics(document.html)) report(d);
  },
};

/** The names a top-level `const` / `let` / `var` binds, patterns and defaults seen through. */
function declaredNames(statement: OxcNode, into: Set<string>): void {
  if (statement.type !== 'VariableDeclaration') return;
  for (const declarator of statement['declarations'] as readonly OxcNode[]) {
    patternNames(declarator['id'] as OxcNode, into);
  }
}

function patternNames(pattern: OxcNode | null, into: Set<string>): void {
  if (pattern === null) return;
  switch (pattern.type) {
    case 'Identifier':
      into.add(pattern['name'] as string);
      return;
    case 'AssignmentPattern':
      patternNames(pattern['left'] as OxcNode, into);
      return;
    case 'RestElement':
      patternNames(pattern['argument'] as OxcNode, into);
      return;
    case 'ObjectPattern':
      for (const property of pattern['properties'] as readonly OxcNode[]) {
        patternNames((property['value'] ?? property['argument']) as OxcNode, into);
      }
      return;
    default:
      // `ArrayPattern`: the one shape left a binding can take (ESTree).
      for (const element of pattern['elements'] as readonly (OxcNode | null)[]) {
        patternNames(element, into);
      }
  }
}
