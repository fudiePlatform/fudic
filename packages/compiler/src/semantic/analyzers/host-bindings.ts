/**
 * `host-bindings` (BUG-32 T5): what the component's own host wrapper — the identity tag of
 * decision 75 — is allowed to carry.
 *
 * **An attribute and an event, and nothing else.** Both reach the output since T2: the
 * attribute is written by the two branches, the event becomes a listener on the host in the
 * client chunk. A `class:` does not, and the reason is not a missing feature:
 *
 * > The classes this file knows are the ones its `<style>` declares, and that stylesheet is
 * > INSIDE the shadow. A class written on the host is resolved OUTSIDE it, against the page
 * > the host lands in — a page this file does not know and cannot see.
 *
 * So the editor would be offering names that never apply and the emit would be writing a
 * class that styles nothing. An error is the honest answer, and it is the same shape as its
 * sister rule: `delegate:` on this very tag is `FUD0663`, reported here rather than by the
 * emit, because a placement rule belongs where the tree is read and not where code is
 * written.
 *
 * A `.prop` is not judged here. The host is not passed props by anybody — it IS the
 * component — and what a `.prop` there means is a question BUG-32 does not answer.
 */

import { FUD0720 } from '@fudic/diagnostics';
import { classifyAttribute } from '../../binding/classify.js';
import type { Analyzer } from '../model.js';

export const hostBindings: Analyzer = {
  name: 'host-bindings',
  run(input, report) {
    if (input.document.type !== 'component-document') return;
    const host = input.document.host;
    if (host === undefined) return;

    for (const attr of host.attributes) {
      const binding = classifyAttribute(attr, input.source).value;
      if (binding.type !== 'class') continue;
      report(FUD0720({ span: attr.span }));
    }
  },
};
