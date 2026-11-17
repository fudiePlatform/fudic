/**
 * `lifecycle`: where a hook may be written. Only as a statement of its own at the top level of
 * `@code` (`FUD1560`): it is registered once, while `@code` runs, and the emit relies on finding
 * it there — a call in the view, a handler or an `@{ }` included, is somewhere else.
 * `beforeCreate` / `afterCreate` only in a component (`FUD1561`): a route, a page and a layout
 * always come from the server. And no declaration of `@code` may take a hook's name (`FUD1562`).
 */

import { FUD1560, FUD1561, FUD1562 } from '@fudic/diagnostics';
import { CREATE_HOOKS, scanHooks } from '../../oxc/index.js';
import type { Analyzer } from '../model.js';
import { codeStatements, viewScope } from '../view-scope.js';

/** The files that are never created in the browser, by their document type. */
const NEVER_CREATED: Readonly<Record<string, 'route' | 'page' | 'layout'>> = {
  'route-document': 'route',
  'page-document': 'page',
  'layout-document': 'layout',
};

export const lifecycle: Analyzer = {
  name: 'lifecycle',
  run(input, report) {
    const map = input.js.mapSpan;
    const { uses, shadows } = scanHooks(codeStatements(input), map);
    const role = NEVER_CREATED[input.document.type];
    for (const use of uses.filter((u) => !u.topLevel)) report(FUD1560({ span: use.span, hook: use.kind }));
    // A create hook nested somewhere is already FUD1560: one voice per call.
    const created = uses.filter((u) => u.topLevel && CREATE_HOOKS.has(u.kind));
    if (role !== undefined) for (const use of created) report(FUD1561({ span: use.span, hook: use.kind, role }));
    for (const shadow of shadows) report(FUD1562({ span: shadow.span, name: shadow.name }));
    // The view's JS: interpolations, attribute values, handlers, `@{ }`, headers of its
    // constructs. None of it is the top level of `@code`.
    for (const fragment of viewScope(input, new Set()).fragments) {
      for (const use of scanHooks(fragment.root, map, false).uses) report(FUD1560({ span: use.span, hook: use.kind }));
    }
  },
};
