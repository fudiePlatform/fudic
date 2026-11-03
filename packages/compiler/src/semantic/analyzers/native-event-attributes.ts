/**
 * `native-event-attributes` (SDD-51 §3.6, decision 139): an `on*` attribute of HTML is an
 * inline script, and fudic's Content-Security-Policy never runs one. It is `FUD0909` with a
 * static value as much as with a dynamic one, on a native tag and on a component's — a
 * component is an element, and the browser reads the attribute on it all the same.
 *
 * `.onSave` (a prop, decision 41.c) and `@click` (fudic's event) are other names entirely.
 *
 * Beside it, the two attribute names React renames (SDD-62): `className` and `htmlFor` are
 * `FUD1160` in any case, on a component too — its prop would be `.className`.
 */

import { FUD0909, FUD1160 } from '@fudic/diagnostics';
import { span } from '../../types/index.js';
import type { Analyzer } from '../model.js';
import { isNativeEventAttribute } from '../html-events.js';
import { documentRoots, walk } from '../walk.js';

/** React's attribute names, lowercased, and the HTML attribute each one stands for. */
const REACT_NAMES: ReadonlyMap<string, 'class' | 'for'> = new Map([
  ['classname', 'class'],
  ['htmlfor', 'for'],
]);

export const nativeEventAttributes: Analyzer = {
  name: 'native-event-attributes',
  run(input, report) {
    walk(documentRoots(input.document), {
      element(el) {
        for (const attr of el.attributes) {
          if (typeof attr.name !== 'string') continue;
          // The attribute is written name first: its span opens on the name.
          const at = span(attr.span.start, attr.span.start + attr.name.length);
          const html = REACT_NAMES.get(attr.name.toLowerCase());
          if (html !== undefined) report(FUD1160({ span: at, name: attr.name, html }));
          else if (isNativeEventAttribute(attr.name)) report(FUD0909({ span: at }));
        }
      },
    });
  },
};
