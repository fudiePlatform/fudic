/**
 * `error-marker` (decision 130, BUG-41 §3.4): an `error="@f.title"` the emit can wire.
 *
 * Three ways a marker breaks something, and all three are about the markup the reader gets,
 * not about style:
 *
 * - `FUD0597` — no element of its block binds that node. The `aria-describedby` would point
 *   from nothing, and inside a control-component the right place is the component's own
 *   template, because the reference does not cross a shadow root.
 * - `FUD0598` — a second marker for the node, or one inside a loop: N elements, one id.
 * - `FUD0599` — content inside it, which the runtime overwrites, or an `id` the compiler cannot
 *   read and therefore cannot point `aria-describedby` at.
 *
 * The rules are `pairMarkers`', the very function the emit pairs with. This analyzer only
 * reports them.
 */

import { errorDiag } from '../../types/index.js';
import { pairMarkers } from '../../binding/index.js';
import type { Analyzer } from '../model.js';
import { documentRoots } from '../walk.js';

export const errorMarker: Analyzer = {
  name: 'error-marker',
  run(input, report) {
    const pairing = pairMarkers(input.source, documentRoots(input.document), (tag) =>
      input.components.has(tag),
    );
    for (const problem of pairing.problems) {
      report(errorDiag(problem.code, problem.message, problem.span));
    }
  },
};
