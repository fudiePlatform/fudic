/**
 * `event-in-loop` (decision 176): an `@event` on an element inside a `@foreach`/`@for`/`@while`
 * body, at any depth. It works — one listener per item — and that is exactly what a long list
 * should not pay for, so it is a WARNING that points at delegation, never an error: a list
 * written without delegating on purpose (`/delegacion` compares the two) is legitimate.
 *
 * The suggestion names the row when the nearest loop header declares exactly one binding, so
 * the author can copy it. An event that does not bubble and has no substitute cannot be
 * delegated at all, and warning about it would recommend the impossible; one with a substitute
 * gets it in the text.
 */

import { FUD1380 } from '@fudic/diagnostics';
import { classifyAttribute } from '../../binding/index.js';
import { loopHeaderNames } from '../../oxc/index.js';
import { span } from '../../types/index.js';
import { NON_BUBBLING } from '../delegation.js';
import type { Analyzer } from '../model.js';
import { documentRoots, walk } from '../walk.js';

export const eventInLoop: Analyzer = {
  name: 'event-in-loop',
  run(input, report) {
    // The bindings of each open loop's header, innermost last.
    const loops: (readonly string[])[] = [];
    walk(documentRoots(input.document), {
      // `control` fires for every construct and `exitLoop` for the three that iterate: reading
      // the discriminant here is what keeps the two in step.
      control(node) {
        if (node.type !== 'foreach' && node.type !== 'for' && node.type !== 'while') return;
        const id = input.fragmentId(node);
        loops.push(loopHeaderNames(id === undefined ? undefined : input.js.ast(id), node.type));
      },
      exitLoop() {
        loops.pop();
      },
      element(el) {
        const names = loops[loops.length - 1];
        if (names === undefined) return;
        for (const attr of el.attributes) {
          const binding = classifyAttribute(attr, input.source).value;
          if (binding.type !== 'event') continue;
          const substitute = NON_BUBBLING.get(binding.name);
          if (substitute === null) continue;
          const start = attr.span.start;
          report(
            FUD1380({
              // The attribute's NAME, `@` included: the value is the handler, not the mistake.
              span: span(start, start + 1 + binding.name.length + (binding.label === undefined ? 0 : 1 + binding.label.length)),
              event: binding.name,
              ...(names.length === 1 ? { name: names[0]! } : {}),
              ...(substitute === undefined ? {} : { substitute }),
            }),
          );
        }
      },
    });
  },
};
