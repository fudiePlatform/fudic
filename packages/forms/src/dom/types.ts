/**
 * The two types every bind function of `@fudic/forms/dom` shares (SDD-34 §3.2).
 *
 * They live apart from the functions so that importing a type costs no module: a page that
 * binds one text field pulls `bindText` and this, and not the other five.
 */

/** What a binding returns: undo everything it set up. The factory pushes it into `$d`. */
export type Cleanup = () => void;

/**
 * The error slot: the element the EMIT already wrote into the markup, `aria-describedby`
 * included (decision 111).
 *
 * The runtime only ever writes its TEXT. It does not create it, does not move it and does
 * not remove it — which is exactly what makes a form's accessibility the same whether it
 * hydrated or not, and exactly what the prototype could not do while it fabricated the
 * `<span>` with `insertAdjacentElement` on first error.
 */
export type ErrorSlot = HTMLElement;
