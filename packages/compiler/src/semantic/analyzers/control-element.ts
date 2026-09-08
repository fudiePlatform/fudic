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
 * - **a dynamic `type`** (`type="@t"`) cannot be decided at compile time. The rescue would be
 *   a runtime dispatch, and that dispatch is exactly the table this whole design removes from
 *   the bundle: a page with one text field would carry all five coercions again.
 *
 * The classification itself is `controlTarget`'s — the same function the emit picks its bind
 * module with (`binding/control.ts`). Answering it twice is how the editor and the build end
 * up disagreeing about what `<input type="range">` is.
 */

import { errorDiag } from '../../types/index.js';
import { classifyAttribute, controlTarget, type UnsupportedControl } from '../../binding/index.js';
import type { Analyzer } from '../model.js';
import { documentRoots, walk } from '../walk.js';

const FUD_CONTROL_UNSUPPORTED_ELEMENT = 'FUD0592';

const MESSAGES: Readonly<Record<UnsupportedControl, string>> = {
  'no-value':
    '`control` needs an element that carries a user value: `submit`, `reset`, `button` and `image` inputs have none',
  file: '`control` on `<input type="file">` is not supported: file upload needs multipart and a value that is not JSON',
  'dynamic-type':
    '`control` needs a `type` known at compile time: an interpolated `type` cannot choose a binding, and no runtime dispatch is emitted for it',
};

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
          report(errorDiag(FUD_CONTROL_UNSUPPORTED_ELEMENT, MESSAGES[target.reason], attr.span));
        }
      },
    });
  },
};
