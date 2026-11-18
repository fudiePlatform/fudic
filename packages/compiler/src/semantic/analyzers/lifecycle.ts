/**
 * `lifecycle`: where a hook may be written. Only as a statement of its own at the top level of
 * `@code` (`FUD1560`): it is registered once, while `@code` runs, and the emit relies on finding
 * it there — a call in the view, a handler or an `@{ }` included, is somewhere else.
 * `beforeCreate` / `afterCreate` only in a component (`FUD1561`): a route, a page and a layout
 * always come from the server. No declaration of `@code` may take a hook's name (`FUD1562`). And
 * a layout's hook runs in the browser, where the layout's props have no value (`FUD1563`).
 */

import { FUD1560, FUD1561, FUD1562, FUD1563 } from '@fudic/diagnostics';
import { CREATE_HOOKS, isHookStatement, scanHooks, type HookScan } from '../../oxc/index.js';
import { freeReferenceNodes, topLevelBindings } from '../../emit/scope.js';
import type { Diagnostic, Span } from '../../types/index.js';
import type { Analyzer } from '../model.js';
import { codeStatements, viewScope } from '../view-scope.js';

/** The files that are never created in the browser, by their document type. */
const NEVER_CREATED: Readonly<Record<string, 'route' | 'page' | 'layout'>> = {
  'route-document': 'route',
  'page-document': 'page',
  'layout-document': 'layout',
};

/** What a `@code` says about its hooks, whoever read it: this pass, or the emit of a layout. */
export interface CodeHooks extends HookScan {
  /** The document type. */
  readonly type: string;
  /** The names the top-level hook calls read from outside them. */
  readonly reads: readonly { readonly name: string; readonly span: Span }[];
  /** The names the `@code` declares at its top level: in a layout, its props. */
  readonly declared: readonly string[];
}

/** The diagnostics of the hooks of one `@code` (the view's are this pass's alone). */
export function codeHookDiagnostics(code: CodeHooks): readonly Diagnostic[] {
  const out: Diagnostic[] = [];
  const role = NEVER_CREATED[code.type];
  for (const use of code.uses.filter((u) => !u.topLevel)) out.push(FUD1560({ span: use.span, hook: use.kind }));
  // A create hook nested somewhere is already FUD1560: one voice per call.
  const created = code.uses.filter((u) => u.topLevel && CREATE_HOOKS.has(u.kind));
  if (role !== undefined) for (const use of created) out.push(FUD1561({ span: use.span, hook: use.kind, role }));
  for (const shadow of code.shadows) out.push(FUD1562({ span: shadow.span, name: shadow.name }));
  if (role !== 'layout') return out;
  const props = new Set(code.declared);
  for (const read of code.reads) if (props.has(read.name)) out.push(FUD1563({ span: read.span, name: read.name }));
  return out;
}

export const lifecycle: Analyzer = {
  name: 'lifecycle',
  run(input, report) {
    const map = input.js.mapSpan;
    const statements = codeStatements(input);
    const reads = freeReferenceNodes(statements.filter(isHookStatement)).map((node) => ({
      name: String(node['name']),
      span: map(node.start, node.end),
    }));
    const scan = scanHooks(statements, map);
    const declared = topLevelBindings(statements);
    codeHookDiagnostics({ ...scan, type: input.document.type, reads, declared }).forEach(report);
    // The view's JS: interpolations, attribute values, handlers, `@{ }`, headers of its
    // constructs. None of it is the top level of `@code`.
    for (const fragment of viewScope(input, new Set()).fragments) {
      for (const use of scanHooks(fragment.root, map, false).uses) report(FUD1560({ span: use.span, hook: use.kind }));
    }
  },
};
