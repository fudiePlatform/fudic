/**
 * `slot-name` — **`FUD0199`**: a `slot="x"` fills a slot the PARENT declares, or it fills
 * nothing at all (BUG-23 §2.6, §4.4).
 *
 * Two ways to be wrong, and the second is the one that used to go unnoticed:
 *
 *  - the element has no component parent, so there is no shadow root to be projected into —
 *    a `slot=` on a page's `<div>` is inert markup the author believes in;
 *  - the parent is a component and declares no `<slot name="x">`.
 *
 * Against the PARENT and on EVERY element, which is the whole correction: the old reading
 * asked the element that carries the attribute, so `<div slot="p">` was never checked and a
 * `<app-badge slot="p">` was checked against `app-badge`'s own slots instead of its host's.
 *
 * Silent, like `component-props`, wherever `slotsOf` is not served: in the language server
 * the projection's `$intoSlot<$Slots>` already checks this against the child's real union,
 * and reporting it twice would be worse than not reporting it at all.
 */

import { errorDiag, type Span } from '../../types/index.js';
import type { ElementNode } from '../../html/index.js';
import type { Analyzer, MarkupInput, Report } from '../model.js';
import { documentRoots, walk } from '../walk.js';

const FUD_UNDECLARED_SLOT = 'FUD0199';

/**
 * The one literal `slot="…"` of an element, with the span of its value.
 *
 * Nothing for `slot` with no value and nothing for an interpolated one: `slot="@(x)"` names a
 * slot whose identity is not known until it runs, and a rule that cannot read a name has
 * nothing to say about it.
 */
function staticSlot(el: ElementNode): { readonly name: string; readonly at: Span } | undefined {
  for (const attr of el.attributes) {
    if (attr.name !== 'slot') continue;
    const only = attr.value.length === 1 ? attr.value[0] : undefined;
    if (only?.type !== 'attribute-text' || only.value === '') return undefined;
    return { name: only.value, at: only.span };
  }
  return undefined;
}

/** The rule itself, over markup alone: the semantic pass and the build both call this. */
export function checkSlotName(input: MarkupInput, report: Report): void {
  const { components } = input;
  const slotsOf = components.slotsOf?.bind(components);
  if (slotsOf === undefined) return;

  walk(documentRoots(input.document), {
    element(el, host) {
      const slot = staticSlot(el);
      if (slot === undefined) return;

      if (host === undefined) {
        report(
          errorDiag(
            FUD_UNDECLARED_SLOT,
            `\`slot="${slot.name}"\` fills nothing: this element has no component parent`,
            slot.at,
          ),
        );
        return;
      }
      const declared = slotsOf(host.name);
      if (declared === undefined) {
        // A tag the registry knows but cannot read is not an error: `undefined` there means
        // «I cannot know», and only a parent that is definitely not a host is reportable.
        if (components.has(host.name)) return;
        report(
          errorDiag(
            FUD_UNDECLARED_SLOT,
            `\`slot="${slot.name}"\` fills nothing: \`${host.name}\` is not a component`,
            slot.at,
          ),
        );
        return;
      }
      if (declared.includes(slot.name)) return;
      report(
        errorDiag(FUD_UNDECLARED_SLOT, `\`${host.name}\` declares no slot \`${slot.name}\``, slot.at),
      );
    },
  });
}

export const slotName: Analyzer = {
  name: 'slot-name',
  run: checkSlotName,
};
