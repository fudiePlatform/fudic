/**
 * `control-element` (decision 109, SDD-34 §4.2): a `control` on an element that cannot carry
 * a user value.
 *
 * Three faces, one code, three messages — because the fix is different in each case and a
 * shared sentence would name none of them:
 *
 * - **`submit` / `reset` / `button` / `image`** have no user value at all. There is nothing to
 *   read out of them and nothing to write into them.
 * - **`file`** is out of scope in v1 (SDD-34 §7): it needs `multipart/form-data` and a value
 *   that is not JSON-serializable.
 *
 * A dynamic `type` used to be the third, and is not any more (decision 109): it binds through
 * `bindByType`, and the chunk of the component that wrote it carries the dispatch. What the
 * closed design keeps out of the bundle is a table nobody asked for — a page with one text
 * field still downloads one function.
 *
 * The classification itself is `controlTarget`'s — the same function the emit picks its bind
 * module with (`binding/control.ts`). Answering it twice is how the editor and the build end
 * up disagreeing about what `<input type="range">` is.
 */

import { FUD0592 } from '@fudic/diagnostics';
import { classifyAttribute, controlTarget } from '../../binding/index.js';
import type { Analyzer } from '../model.js';
import { documentRoots, walk } from '../walk.js';

export const controlElement: Analyzer = {
  name: 'control-element',
  run(input, report) {
    walk(documentRoots(input.document), {
      element(el) {
        for (const attr of el.attributes) {
          const binding = classifyAttribute(attr, input.source).value;
          if (binding.type !== 'control') continue;
          const target = controlTarget(el, input.components.has(el.name));
          if (target.kind !== 'unsupported') continue;
          report(FUD0592({ span: attr.span, reason: target.reason }));
        }
      },
    });
  },
};
