/**
 * FUD0704 — a layout prop read in the `<body>` (BUG-44).
 *
 * A layout's props are bindings of the document's HEAD — the `<html lang>`, a `<meta>`, the
 * `<head>` itself — and never of the body. What differs from route to route in the body
 * already has its own mechanism: the route fills a `@RenderSection` with its own markup, the
 * way `site-nav` is. A prop there is a second, hidden path for the same thing, and the page
 * ends up painted half by the route and half by values the route handed over for its head.
 *
 * ONE rule and two callers. The editor runs only this semantic pass, and the build reads the
 * layout's diagnostics off its emit; `propReadsInBody` is what both of them call, so the two
 * cannot disagree about what counts as a read.
 *
 * By FREE references, not by text: `@(post.seccion)` reads `post`, and a name a lambda
 * declares is its own. The fragments are walked together in source order so a loop header's
 * declaration shadows the prop inside its body, as it does at runtime.
 */

import type { OxcNode } from '../../oxc/index.js';
import type { Diagnostic } from '../../types/index.js';
import { errorDiag, span } from '../../types/index.js';
import { freeReferenceNodes, type FragmentAst } from '../../emit/scope.js';
import type { Analyzer } from '../model.js';
import { walk } from '../walk.js';

const FUD_LAYOUT_PROP_IN_BODY = 'FUD0704';

/**
 * Every read of one of `props` in `fragments`, as a `FUD0704` over the name.
 *
 * `toSource` maps an Oxc offset — a BUFFER coordinate — back onto the `.fud`.
 */
export function propReadsInBody(
  props: ReadonlySet<string>,
  fragments: readonly FragmentAst[],
  toSource: (bufferOffset: number) => number,
): readonly Diagnostic[] {
  if (props.size === 0) return [];
  return freeReferenceNodes(fragments)
    .filter((node) => props.has(node['name'] as string))
    .map((node) =>
      errorDiag(
        FUD_LAYOUT_PROP_IN_BODY,
        `the layout prop \`${node['name'] as string}\` is read in the <body>: a layout's props are bindings of the head — <html>, <head> and what is inside it — and what differs from route to route in the body is the route's to write, in a \`@section\``,
        span(toSource(node.start), toSource(node.end)),
      ),
    );
}

export const layoutPropInBody: Analyzer = {
  name: 'layout-prop-in-body',
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

    const fragments: FragmentAst[] = [];
    const add = (node: Parameters<typeof input.fragmentId>[0]): void => {
      const id = input.fragmentId(node);
      if (id !== undefined) fragments.push(input.js.ast(id));
    };
    walk([document.body], { interpolation: add, binding: add, control: add });

    for (const d of propReadsInBody(props, fragments, input.js.mapOffset)) report(d);
  },
};

/** The names a top-level `const` / `let` / `var` binds, patterns and defaults seen through. */
function declaredNames(statement: OxcNode, into: Set<string>): void {
  if (statement.type !== 'VariableDeclaration') return;
  for (const declarator of statement['declarations'] as readonly OxcNode[]) {
    patternNames(declarator['id'] as OxcNode, into);
  }
}

function patternNames(pattern: OxcNode | null | undefined, into: Set<string>): void {
  if (pattern === null || pattern === undefined) return;
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
    case 'ArrayPattern':
      for (const element of pattern['elements'] as readonly (OxcNode | null)[]) {
        patternNames(element, into);
      }
      return;
    default:
      return;
  }
}
