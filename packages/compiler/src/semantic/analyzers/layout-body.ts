/**
 * What the `<body>` of a LAYOUT may not hold (BUG-44, narrowed by SDD-48).
 *
 * A layout's body is markup like any other since SDD-48: it renders components and snippets,
 * binds its props into them, and may branch and loop — a layout that wraps its route in a
 * component has to be able to hand that component its props. Two things stay out:
 *
 *   `FUD0705`  a `@{ }` block, anywhere in the body. A layout declares its props and no logic
 *              of its own (SDD-40 §4.1): a statement block would be the loose logic its
 *              `@code` already refuses, written one level down.
 *   `FUD0706`  a `@` inside any `<style>` of the layout, head or body: its CSS is the shell's.
 *   `FUD0443`  a hole inside a construct: the route would be written zero or many times.
 *
 * `FUD0704` — a layout prop read in the body — is RETIRED by SDD-48: binding a prop into the
 * component that wraps the route is exactly what a layout is for. The code is not reused.
 *
 * ONE rule and two callers. The editor runs only the semantic pass, and the build reads the
 * layout's diagnostics off its emit; `layoutBodyDiagnostics` is what both of them call, so the
 * two cannot disagree about what the body may hold.
 */

import type { Diagnostic } from '../../types/index.js';
import { errorDiag, span } from '../../types/index.js';
import type { ElementNode, HtmlContent } from '../../html/index.js';
import type { Analyzer } from '../model.js';
import { walk } from '../walk.js';

const FUD_LAYOUT_BODY_CONSTRUCT = 'FUD0705';
const FUD_LAYOUT_STYLE_BINDING = 'FUD0706';
const FUD_HOLE_IN_CONSTRUCT = 'FUD0443';

const CONSTRUCTS: ReadonlySet<string> = new Set(['if', 'switch', 'foreach', 'for', 'while']);

/**
 * Every `@{ }` of a layout's `<body>`, reported over its opening `@{`, and every hole written
 * inside a construct (`FUD0443`).
 */
export function layoutBodyDiagnostics(body: ElementNode): readonly Diagnostic[] {
  const out: Diagnostic[] = [];
  walk(body.children, {
    inlineCode(node) {
      out.push(
        errorDiag(
          FUD_LAYOUT_BODY_CONSTRUCT,
          'the <body> of a layout writes no `@{ }`: a layout declares its props and no logic of its own — what the block would compute belongs to a component or to the route',
          span(node.span.start, node.span.start + 2),
        ),
      );
    },
  });
  holesInConstructs(body.children, out);
  return out;
}

/**
 * `FUD0443` — a `@RenderBody()` or `@RenderSection()` inside a construct of the layout.
 *
 * A branch that does not run drops the route, a loop writes it N times, and in both the
 * route's chunk — which crosses the layout by position — no longer finds its own nodes. A
 * hole is a fixed point of the shell. Reported once per hole, from the outermost construct.
 */
function holesInConstructs(content: readonly HtmlContent[], out: Diagnostic[]): void {
  for (const node of content) {
    if (node.type === 'element') {
      holesInConstructs(node.children, out);
    } else if (CONSTRUCTS.has(node.type)) {
      walk([node], {
        hole(hole) {
          out.push(
            errorDiag(
              FUD_HOLE_IN_CONSTRUCT,
              'a hole of the layout cannot live inside `@if`, `@switch` or a loop: the route would be written zero or many times. Keep the hole fixed and branch inside the route',
              hole.span,
            ),
          );
        },
      });
    }
  }
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

export const layoutBody: Analyzer = {
  name: 'layout-body',
  run(input, report) {
    const document = input.document;
    if (document.type !== 'layout-document') return;
    for (const d of layoutBodyDiagnostics(document.body)) report(d);
    for (const d of layoutStyleDiagnostics(document.html)) report(d);
  },
};
