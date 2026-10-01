/**
 * `control-in-loop` (decision 114, SDD-34 §4.1): a `control` binding inside a
 * `@foreach`/`@for`/`@while` subtree.
 *
 * It is `ref-in-loop` next door, applied for the same reason and with the same shape: one
 * expression naming N elements. `ref` cannot name N nodes of the DOM and `control` cannot bind
 * N elements to one node of the form — the loop would hand every row the same `Control<T>`,
 * and the last one to render would win the value while the other rows painted its errors.
 *
 * Collections of controls are out of scope in v1 (SDD-33 §7), and when they arrive they bring
 * their own way of naming the row. Until then this is an error and not a silent misbinding.
 *
 * `@if`/`@switch` do not iterate, so they open no loop context.
 */

import { FUD0594 } from '@fudic/diagnostics';
import { classifyAttribute } from '../../binding/index.js';
import type { Analyzer } from '../model.js';
import { documentRoots, walk } from '../walk.js';

export const controlInLoop: Analyzer = {
  name: 'control-in-loop',
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
          if (binding.type !== 'control') continue;
          report(FUD0594({ span: attr.span }));
        }
      },
    });
  },
};
