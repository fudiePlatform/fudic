/**
 * `error-marker` (decisions 130 and 131, BUG-41 §3.4, BUG-42 §3.6): an `error="@f.title"` or a
 * `summary="@f"` the emit can wire.
 *
 * Every way a marker breaks something is about the markup the reader gets, not about style:
 *
 * - `FUD0597` — no element of its block binds that node: neither a native control nor a
 *   `formassociated` component, whose input the relay can carry a description to. The
 *   `aria-describedby` would point from nothing.
 * - `FUD0598` — a second marker for the node, or one inside a loop: N elements, one id.
 * - `FUD0599` — content inside it, which the runtime overwrites, or an `id` the compiler cannot
 *   read and therefore cannot point `aria-describedby` at.
 * - `FUD0600` / `FUD0601` — the wrong attribute for what the node is: `error` on a form or a
 *   group, `summary` on a control. Decided by the element that binds it, because the type of a
 *   root form and of a group is the same.
 * - `FUD0602` — a summary on an element that cannot hold the list the runtime writes.
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
    const pairing = pairMarkers(
      input.source,
      documentRoots(input.document),
      (tag) => input.components.has(tag),
      (tag) => input.components.formAssociated?.(tag),
    );
    for (const problem of pairing.problems) {
      report(errorDiag(problem.code, problem.message, problem.span));
    }
  },
};
