/**
 * A summary in the DOM: the list, and the links in it (BUG-42 §4.6, §4.7).
 *
 * `bindForm` and `bindGroup` paint their marker through this, and it paints it through
 * `summaryOf` — the same function the server wrote it with. On hydration the first run finds
 * the server's children already there, equal, and leaves them: the runtime TAKES the list, it
 * does not write it again, and a live region is not re-announced for nothing.
 *
 * **The links move the focus.** A click on `<a href="#nom">` would only scroll to the element
 * and leave the focus where it was; and for a control-component the target is a host in the
 * page's tree, whose focus lands in its input through `delegatesFocus`. So the click is taken,
 * the field is focused, and it is centred in the view. The `href` stays for whoever has no
 * JavaScript.
 */

import { effect } from '@fudic/core';
import { summaryOf } from '../summary-markup.js';
import type { AnyForm } from '../types.js';
import type { Cleanup } from './types.js';
import { on, undo } from './wiring.js';

/** The field a link of the summary points at, in the tree the summary lives in. */
function targetOf(summary: HTMLElement, event: Event): HTMLElement | null {
  const link = (event.target as Element).closest('a');
  const href = link?.getAttribute('href') ?? '';
  if (!href.startsWith('#')) return null;
  const root = summary.getRootNode() as Document | ShadowRoot;
  return root.getElementById(href.slice(1));
}

export function bindSummary(
  summary: HTMLElement,
  node: AnyForm,
  links: Readonly<Record<string, string>> | null,
): Cleanup {
  return undo([
    effect(() => {
      const html = summaryOf(node, summary.id, links);
      if (summary.innerHTML !== html) summary.innerHTML = html;
    }),
    on(summary, 'click', (event) => {
      const field = targetOf(summary, event);
      if (field === null) return;
      event.preventDefault();
      field.focus();
      field.scrollIntoView({ block: 'center' });
    }),
  ]);
}
