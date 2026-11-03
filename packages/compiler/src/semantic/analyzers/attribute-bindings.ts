/**
 * `attribute-bindings`: what the classification of an attribute has to say, said once.
 *
 * `classifyAttribute` decides what an attribute IS — an event, a property, a `ref`, a
 * `control`, a spread — and, when it cannot, why (`FUD0091`–`FUD0099`, `FUD0590`, `FUD0596`,
 * `FUD0667`, `FUD0991`, the shape of a `form:`). Every other reader asks it for the binding and
 * leaves the reasons; this is the one place they reach the author, in the build and in the editor.
 */

import { classifyAttribute } from '../../binding/index.js';
import type { Analyzer } from '../model.js';
import { documentRoots, walk } from '../walk.js';

export const attributeBindings: Analyzer = {
  name: 'attribute-bindings',
  run(input, report) {
    walk(documentRoots(input.document), {
      element(el) {
        for (const attr of el.attributes) classifyAttribute(attr, input.source).diagnostics.forEach(report);
      },
    });
  },
};
