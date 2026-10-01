/**
 * `native-event-attributes` (SDD-51 §3.6, decision 139): an `on*` attribute of HTML is an
 * inline script, and fudic's Content-Security-Policy never runs one. It is `FUD0909` with a
 * static value as much as with a dynamic one, on a native tag and on a component's — a
 * component is an element, and the browser reads the attribute on it all the same.
 *
 * `.onSave` (a prop, decision 41.c) and `@click` (fudic's event) are other names entirely.
 */

import { FUD0909 } from '@fudic/diagnostics';
import { span } from '../../types/index.js';
import type { Analyzer } from '../model.js';
import { isNativeEventAttribute } from '../html-events.js';
import { documentRoots, walk } from '../walk.js';

export const nativeEventAttributes: Analyzer = {
  name: 'native-event-attributes',
  run(input, report) {
    walk(documentRoots(input.document), {
      element(el) {
        for (const attr of el.attributes) {
          if (typeof attr.name !== 'string' || !isNativeEventAttribute(attr.name)) continue;
          // The attribute is written name first: its span opens on the name.
          report(FUD0909({ span: span(attr.span.start, attr.span.start + attr.name.length) }));
        }
      },
    });
  },
};
