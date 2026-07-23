/**
 * `ref-in-loop` (decision 31): a `ref` binding inside a `@foreach`/`@for`/`@while` subtree.
 * A single `ref` cannot name N elements, so the compiler rejects it (a dedicated per-item
 * syntax may come later). `@if`/`@switch` do not iterate, so they do not open a loop context.
 *
 * The attribute is re-classified (SDD-07) only to learn whether it is a `ref`; the
 * classification diagnostics belong to SDD-07's own pass and are discarded here.
 */

import { errorDiag } from '../../types/index.js';
import { classifyAttribute } from '../../binding/index.js';
import type { Analyzer } from '../model.js';
import { documentRoots, walk } from '../walk.js';

const FUD_REF_IN_LOOP = 'FUD0192';

export const refInLoop: Analyzer = {
  name: 'ref-in-loop',
  run(input, report) {
    let loopDepth = 0;
    walk(documentRoots(input.document), {
      enterLoop() {
        loopDepth += 1;
      },
      exitLoop() {
        loopDepth -= 1;
      },
      element(el) {
        if (loopDepth === 0) return;
        for (const attr of el.attributes) {
          const binding = classifyAttribute(attr, input.source).value;
          if (binding.type === 'ref') {
            report(
              errorDiag(
                FUD_REF_IN_LOOP,
                '`ref` is not allowed inside a loop (@foreach/@for/@while)',
                attr.span,
              ),
            );
          }
        }
      },
    });
  },
};
