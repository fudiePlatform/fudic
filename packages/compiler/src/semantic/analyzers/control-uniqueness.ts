/**
 * `control-uniqueness` (decision 108, SDD-34 §4.1): one form node binds one element, within
 * one component.
 *
 * Two `control="@f.title"` in the same file is `FUD0591`. Two views of the same value is not a
 * form case at all — it is an interpolation, and `@f.title()` already writes it. Letting both
 * bind would give the node two writers and two error slots, and the reader would hear the
 * error twice or once, depending on which one the effect reached last.
 *
 * **The one exception is `<input type="radio">`, and it is the element's, not the compiler's.**
 * A radio group is N elements expressing ONE value; that is what a radio group IS. So several
 * `control` on the same node are legitimate when **every** one of them is a radio, and the emit
 * gathers them into a single `bindRadio` with the list. Mix a radio with anything else and the
 * rule comes back: those two elements really are two writers of one value.
 *
 * The node's identity is the TEXT of the expression, verbatim from the source. Not an AST
 * comparison, and deliberately not: `@f.title` and `@f["title"]` denote the same node and this
 * rule will not say so. Deciding that needs the schema, the schema has types, and TypeScript
 * owns it (§4.9); what this rule owns is the shape a reader can see — the same words twice.
 */

import { errorDiag } from '../../types/index.js';
import { classifyAttribute, isRadio } from '../../binding/index.js';
import type { ElementNode } from '../../html/index.js';
import type { Attribute } from '../../html/index.js';
import type { Analyzer } from '../model.js';
import { documentRoots, walk } from '../walk.js';

const FUD_CONTROL_DUPLICATE = 'FUD0591';

/** One `control` binding, as this rule needs to see it: where it is, and on what. */
interface Bound {
  readonly attr: Attribute;
  readonly radio: boolean;
}

export const controlUniqueness: Analyzer = {
  name: 'control-uniqueness',
  run(input, report) {
    /** expression text → the elements that bound it, in source order. */
    const bound = new Map<string, Bound[]>();
    walk(documentRoots(input.document), {
      element(el: ElementNode) {
        for (const attr of el.attributes) {
          const binding = classifyAttribute(attr, input.source).value;
          if (binding.type !== 'control') continue;
          const key = input.source.slice(binding.value.expr.start, binding.value.expr.end).trim();
          const list = bound.get(key) ?? [];
          list.push({ attr, radio: isRadio(el) });
          bound.set(key, list);
        }
      },
    });

    for (const [expression, list] of bound) {
      if (list.length < 2) continue;
      // All radios: one value, N elements — the group the element type already defines.
      if (list.every((b) => b.radio)) continue;
      // Every element past the first: the first is the binding that stands, and the rest are
      // the ones the author has to remove.
      for (const duplicate of list.slice(1)) {
        report(
          errorDiag(
            FUD_CONTROL_DUPLICATE,
            `\`${expression}\` is already bound to another element in this component: a form node binds one element, unless every one of them is an \`<input type="radio">\``,
            duplicate.attr.span,
          ),
        );
      }
    }
  },
};
