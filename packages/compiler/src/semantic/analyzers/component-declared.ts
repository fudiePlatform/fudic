/**
 * `component-declared` (decision 41): a custom element (hyphenated name) must be a declared
 * component. With the single-file `ComponentRegistry` (an empty one, in v1), every unregistered
 * custom tag is flagged; a real cross-file resolver is future work (§8.2).
 *
 * Two elements are NOT usages and are excluded:
 * - The component's own host wrapper — it DECLARES the component's identity (decision 75),
 *   it does not use one; it is never in its own registry.
 * - svg/math elements — some standard ones are hyphenated (`color-profile`) yet are not custom
 *   elements, so only the `html` namespace is checked (decision 41.b).
 */

import { FUD0191 } from '@fudic/diagnostics';
import type { Analyzer } from '../model.js';
import { documentRoots, walk } from '../walk.js';

export const componentDeclared: Analyzer = {
  name: 'component-declared',
  run(input, report) {
    const host =
      input.document.type === 'component-document' ? input.document.host : undefined;

    walk(documentRoots(input.document), {
      element(el) {
        if (el === host) return;
        if (el.namespace !== 'html') return;
        if (!el.name.includes('-')) return;
        if (input.components.has(el.name)) return;

        report(FUD0191({ span: el.openSpan, tag: el.name }));
      },
    });
  },
};
