/**
 * `lifecycle`: where a hook of `@code` may be written. Only as a statement of its own at the top
 * level (`FUD1560`): it is registered once, while `@code` runs, and the emit relies on finding it
 * there. `beforeCreate` / `afterCreate` only in a component (`FUD1561`): a route, a page and a
 * layout always come from the server. And no declaration may take a hook's name (`FUD1562`).
 */

import { FUD1560, FUD1561, FUD1562 } from '@fudic/diagnostics';
import { CREATE_HOOKS, scanHooks } from '../../oxc/index.js';
import type { Analyzer } from '../model.js';
import { codeStatements } from '../view-scope.js';

/** The files that are never created in the browser, by their document type. */
const NEVER_CREATED: Readonly<Record<string, 'route' | 'page' | 'layout'>> = {
  'route-document': 'route',
  'page-document': 'page',
  'layout-document': 'layout',
};

export const lifecycle: Analyzer = {
  name: 'lifecycle',
  run(input, report) {
    const { uses, shadows } = scanHooks(codeStatements(input), input.js.mapSpan);
    const role = NEVER_CREATED[input.document.type];
    for (const use of uses) {
      if (!use.topLevel) report(FUD1560({ span: use.span, hook: use.kind }));
      else if (role !== undefined && CREATE_HOOKS.has(use.kind)) report(FUD1561({ span: use.span, hook: use.kind, role }));
    }
    for (const shadow of shadows) report(FUD1562({ span: shadow.span, name: shadow.name }));
  },
};
