/**
 * The remedy for `shadowrootdelegatesfocus` where the parser ignored it (SDD-83 §4.6).
 *
 * The attribute is written by the server, and a browser that predates it (it reached every
 * core browser on 2024-09-16) leaves a shadow root that does not delegate. Only script can
 * make up for it, and a hydrated control already runs script, so the remedy lives where the
 * instance comes alive. A component created on the client never needs it:
 * `attachShadow({ delegatesFocus: true })` has been everywhere for years.
 *
 * What it reproduces is what a form needs from delegation: the host becomes focusable, and
 * focus that lands on the host itself — a click on its `<label>`, `host.focus()` — moves on to
 * the first focusable element of its shadow root.
 */

/**
 * What can take the focus, in tree order. The delegate of a real `delegatesFocus` is the first
 * FOCUSABLE area, not the first tabbable one, so `tabindex="-1"` counts.
 *
 * One literal and not an array joined at load: a call at the top of a module makes it a module
 * with side effects to the bundler, which then stops inlining it into the chunk of the component
 * that reaches it and pulls the runtime around it into a chunk of its own.
 */
const FOCUSABLE =
  'input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),' +
  'button:not([disabled]),a[href],area[href],iframe,summary,[tabindex],' +
  '[contenteditable]:not([contenteditable="false"])';

/** Moves the focus into the shadow root, unless it is already there. */
function delegate(shadow: ShadowRoot): void {
  // Focus inside the shadow root reaches the host retargeted: it is already delegated.
  if (shadow.activeElement !== null) return;
  shadow.querySelector<HTMLElement>(FOCUSABLE)?.focus();
}

/**
 * Makes `host` delegate its focus into `shadow`, as `delegatesFocus` would.
 *
 * - The host becomes focusable (`tabIndex = -1`, unless its author gave it a `tabindex`), so a
 *   `<label>` click and `focus()` can land on it at all.
 * - Focus that lands on it goes on to the first focusable element inside.
 * - A click aimed at the host itself — what a `<label>` forwards to its control — does the same,
 *   for the engines that forward the click without moving the focus.
 */
export function delegateFocus(host: HTMLElement, shadow: ShadowRoot): void {
  if (!host.hasAttribute('tabindex')) host.tabIndex = -1;
  host.addEventListener('focus', () => {
    delegate(shadow);
  });
  host.addEventListener('click', (event) => {
    // A click from inside the shadow root is retargeted to the host: only one aimed AT it counts.
    if (event.composedPath()[0] === host) delegate(shadow);
  });
}
