/**
 * `@fudic/forms/dom` — the browser half of a form, and ONLY what the emit invokes
 * (SDD-34 §3.2).
 *
 * There is no `bindAll`, no scan of the DOM for `[control]` and no table keyed by `el.type`.
 * The compiler knows which element each one is, so it writes the call: this module is a set of
 * named exports whose whole design goal is that a page which binds one text field carries one
 * of them.
 *
 * Each `bind*` lives in its own module and none imports another. What they share —
 * add/remove a listener, and paint an error into the slot the emit already wrote — is in
 * `wiring.ts`, because that half is the SAME fact for all six and two copies of it would drift
 * into two different accessibilities.
 */

export type { Cleanup, ErrorSlot } from './types.js';
// Re-exported and not owned: the text of an error is written by the SERVER too (§4.3), so it
// lives in the model. It is here because §3.2 declares it as part of this entry point, and a
// re-export costs nothing a bundler cannot see through.
export type { Messages } from '../messages.js';
export { setMessages } from '../messages.js';

export { bindText } from './bind-text.js';
export { bindNumber } from './bind-number.js';
export { bindCheckbox } from './bind-checkbox.js';
export { bindRadio } from './bind-radio.js';
export { bindSelect } from './bind-select.js';
export { bindSelectMultiple } from './bind-select-multiple.js';
// The one that chooses at runtime, for an `<input type="@t">`. It imports four of the five
// above, so it is the one module that is NOT free — and it is only ever imported by the chunk
// of a component that wrote a dynamic `type` (§4.2).
export { bindByType } from './bind-by-type.js';

export { bindForm } from './bind-form.js';
export { bindGroup } from './bind-group.js';
