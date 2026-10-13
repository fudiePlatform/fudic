/**
 * `spread-target` (props-spec §5): `...item` goes on a component, because what it expands
 * against is the child's `props<T>()` (decision 146). A native element declares no props, and
 * neither does the component's own host wrapper — it declares the component, it does not use
 * one — so a spread on either is `FUD0992`.
 *
 * A hyphenated tag the registry does not know is left alone: `FUD0191` already says the tag is
 * not a component, and that is the one fact to fix.
 */

import { FUD0992 } from '@fudic/diagnostics';
import { classifyAttribute } from '../../binding/index.js';
import type { Analyzer } from '../model.js';
import { documentRoots, walk } from '../walk.js';

export const spreadTarget: Analyzer = {
  name: 'spread-target',
  run(input, report) {
    const host = input.document.type === 'component-document' ? input.document.host : undefined;
    walk(documentRoots(input.document), {
      element(el) {
        const custom = el !== host && el.namespace === 'html' && el.name.includes('-');
        if (custom) return;
        for (const attr of el.attributes) {
          if (classifyAttribute(attr, input.source).value.type === 'spread') report(FUD0992({ span: attr.span }));
        }
      },
    });
  },
};
