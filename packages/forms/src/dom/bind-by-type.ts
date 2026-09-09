/**
 * `bindByType` — the ONE binding chosen at runtime, for the `<input type="@t">` the compiler
 * cannot decide (SDD-34 §4.2, decision 109).
 *
 * Everything else in this entry point exists so that a page which binds one text field
 * downloads one function. This module is the deliberate exception, and the reason it is not a
 * betrayal of that goal is where the cost lands: **it is only imported by the chunk of the
 * component that actually wrote a dynamic `type`.** A page with a plain `<input type="text"
 * control="@f.name">` still carries `bindText` and nothing else — the budget of §6.15 is
 * measured per route and stays exactly as it was.
 *
 * What it buys is the component the language could not express before: ONE `app-input` whose
 * `type` is a prop, instead of one component per shape of `<input>`. That is a real form of
 * reuse, and paying for it inside the component that asked for it is the right place for the
 * bill.
 *
 * **The dispatch happens once per bind, not once per keystroke.** This is not the prototype's
 * `switch (el.type)` inside the event handler: it picks a function, calls it, and hands back
 * that function's own `Cleanup`. When the `type` prop moves, the emit re-runs the binding
 * through `$cb` — undoing the previous one first — so the element is never bound twice.
 *
 * An unknown or unsupported `type` binds NOTHING and returns a no-op cleanup, which is the
 * same answer `FUD0592` gives at compile time for a static one: `submit`, `reset`, `button`,
 * `image` carry no user value and `file` is out of scope in v1 (SDD-33 §7). It does not throw
 * — a `type` that arrives from a prop is data, and the runtime does not take a page down over
 * data.
 */

import type { Control } from '../types.js';
import type { Cleanup, ErrorSlot } from './types.js';
import { bindText } from './bind-text.js';
import { bindNumber } from './bind-number.js';
import { bindCheckbox } from './bind-checkbox.js';
import { bindRadio } from './bind-radio.js';

/** Nothing bound, nothing to undo. */
const NOTHING: Cleanup = () => {};

/**
 * The textual types, spelled out rather than inferred by exclusion.
 *
 * A list and not a `default:` branch, because the two answers differ for a `type` nobody
 * planned for: a misspelt `"tex"` must bind nothing, not silently become a text field. The
 * set is the same one `controlTarget` uses for the static case — one table, two readers, or
 * the browser and the compiler stop agreeing about what an `<input>` is.
 */
const TEXTUAL: ReadonlySet<string> = new Set([
  '',
  'text',
  'search',
  'url',
  'tel',
  'password',
  'email',
  'date',
  'time',
  'color',
]);

const NUMERIC: ReadonlySet<string> = new Set(['number', 'range']);

/**
 * Bind `el` to `control`, choosing the shape from `type` as the browser reports it.
 *
 * `control` is `Control<unknown>` because a component with a dynamic `type` cannot declare
 * which value it holds — that is the same fact the `type` being dynamic states, seen from the
 * model's side. Each branch narrows it to what its own binding needs, and that cast is the
 * only one in this entry point: it exists because the pairing of `type` and value is a runtime
 * fact here, and pretending otherwise would push the cast out into every author's file.
 */
export function bindByType(
  el: HTMLInputElement,
  control: Control<unknown>,
  slot: ErrorSlot,
  type: string,
): Cleanup {
  // No guard in front of it: the caller is the emit, and what it passes is `el.type` off an
  // `<input>`, which the DOM always answers with a string. A `?? ''` here would be a branch no
  // test can reach and no reader can justify.
  const kind = type.toLowerCase();
  if (TEXTUAL.has(kind)) return bindText(el, control as Control<string>, slot);
  if (NUMERIC.has(kind)) return bindNumber(el, control as Control<number | null>, slot);
  if (kind === 'checkbox') return bindCheckbox(el, control as Control<boolean>, slot);
  // A group of radios is N elements for ONE value, and a dynamic `type` names one element.
  // Binding it alone is still right: the group is what the author writes, not what the type
  // string says, and a single radio is a legitimate — if unusual — control.
  if (kind === 'radio') return bindRadio([el], control as Control<string>, slot);
  return NOTHING;
}
