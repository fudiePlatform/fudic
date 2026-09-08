/**
 * What a `control` binding MEANS on the element it was written on (SDD-34 §4.1–§4.2,
 * decision 109) — and, when that element carries a value, WHICH bind function the emit
 * writes for it.
 *
 * **This is the `switch (el.type)` the prototype ran in the browser, moved to compile time.**
 * `docs/forms/bind.js` discriminated on the live element, which kept all five coercions alive
 * in the bundle of a page that had one text field. Here the discrimination happens once, over
 * the AST, and what reaches the chunk is one call to one module.
 *
 * It lives in `binding/` and not in `emit/` for the same reason `handlerShape` and `crossing`
 * do: the emit and the editor must answer it with the SAME function. A rule only one of the
 * two knows is BUG-23 §2.4 all over again — the semantic pass reports `FUD0592` off this
 * answer and the emit picks the module off it, and the two cannot be allowed to disagree
 * about what `<input type="range">` is.
 *
 * What it deliberately does NOT decide: whether the expression names a real path, and whether
 * the node it names is of the type the element expects. Both are questions about a schema, the
 * schema has types, and TypeScript answers them over the SDD-23 projection (§4.9). The emit
 * checks SHAPES — which element, how many times, inside what.
 */

import { decodeEntities, type Attribute, type AttributeText, type ElementNode } from '../html/index.js';

/**
 * The compile-time marker that makes a component a control-component (decision 111).
 *
 * It never reaches the DOM: an unknown attribute on a `<template>` is inert, so the browser
 * ignores it and the compiler consumes it. What it decides is which class the emitted code
 * extends, whether the shadow root delegates focus, and whether the tag joins the page map's
 * `eager` list — nothing that could be asked of the browser declaratively, because `static
 * formAssociated` is read when the class is DEFINED.
 */
export const FORM_ASSOCIATED_ATTR = 'formassociated';

/**
 * The prop a `control` on a component tag crosses under (decision 112).
 *
 * `ctrl`, and it is a CONVENTION rather than something derived: §3.1's canonical
 * control-component reads `<input control="@ctrl">` inside its own template, so `ctrl` is the
 * name a control-component already declares. Deriving it instead — «whatever the child's own
 * root binding happens to name» — would make the parent's output depend on a detail of the
 * child's template that neither of them writes down.
 *
 * A child that declares no `ctrl` prop receives nothing: the crossing lands by prop NAME, and
 * a name the child did not declare is not a slot in its payload. That is the rule every other
 * prop follows, and it is what keeps the contract the child's.
 */
export const CONTROL_PROP = 'ctrl';

/** Whether a `<template>` element carries the `formassociated` marker. */
export function isFormAssociated(el: ElementNode): boolean {
  return el.attributes.some(
    (a) => typeof a.name === 'string' && a.name.toLowerCase() === FORM_ASSOCIATED_ATTR,
  );
}

/** The six bind functions of `@fudic/forms/dom`, one per FORM of element (§3.2). */
export type BindFunction =
  | 'bindText'
  | 'bindNumber'
  | 'bindCheckbox'
  | 'bindRadio'
  | 'bindSelect'
  | 'bindSelectMultiple';

/** Why an element carrying `control` cannot be bound — the three faces of `FUD0592`. */
export type UnsupportedControl =
  /** `submit`, `reset`, `button`, `image`: no user value to carry. */
  | 'no-value'
  /** `file`: out of scope in SDD-34 §7 — multipart, and a value that is not JSON. */
  | 'file'
  /** `type="@t"`: not decidable at compile time, and no runtime dispatch will rescue it. */
  | 'dynamic-type';

/**
 * What the element makes of the binding. The four cases of decision 109, plus the rejection
 * that is `FUD0592` — carried as a VALUE rather than thrown, because the emit never throws:
 * it reports, drops that one binding and goes on emitting the file.
 */
export type ControlTarget =
  /** `<form control="@f">` — state, never action (§4.4). */
  | { readonly kind: 'form' }
  /** `input` / `textarea` / `select` — the one bind function of THIS shape of element. */
  | { readonly kind: 'value'; readonly bind: BindFunction }
  /** A component tag: the reference crosses as a prop (decision 112). */
  | { readonly kind: 'component'; readonly tag: string }
  /** Anything else: a group, wherever the author put it. */
  | { readonly kind: 'group' }
  | { readonly kind: 'unsupported'; readonly reason: UnsupportedControl };

/**
 * `<input type="…">` values that carry no user value. Binding one is `FUD0592`: there is
 * nothing to read out of it and nothing to write into it.
 */
const NO_VALUE_TYPES: ReadonlySet<string> = new Set(['submit', 'reset', 'button', 'image']);

/** The types with a coercion of their own. Everything else an `<input>` can be is text. */
const NUMERIC_TYPES: ReadonlySet<string> = new Set(['number', 'range']);

/**
 * The `type` of an element, as compilation can see it.
 *
 * `undefined` — no `type` attribute at all, which for an `<input>` is `text`.
 * `null` — a `type` that holds an expression, so its value only exists at runtime.
 * a string — the literal, lowercased, because the DOM does not care how it was spelled.
 */
function staticType(el: ElementNode): string | null | undefined {
  const attr = el.attributes.find((a) => typeof a.name === 'string' && a.name.toLowerCase() === 'type');
  if (attr === undefined) return undefined;
  return literalValue(attr)?.toLowerCase() ?? null;
}

/** An attribute's value when every part of it is literal text, `null` when any part is not. */
function literalValue(attr: Attribute): string | null {
  const texts: string[] = [];
  for (const part of attr.value) {
    if (part.type !== 'attribute-text') return null;
    texts.push(decodeEntities((part as AttributeText).value));
  }
  return texts.join('');
}

/** Whether the element carries a bare `multiple` — `<select multiple>` binds an array. */
function hasMultiple(el: ElementNode): boolean {
  return el.attributes.some((a) => typeof a.name === 'string' && a.name.toLowerCase() === 'multiple');
}

/**
 * The bind function of an `<input>`, or the reason it has none.
 *
 * **An unlisted `type` is text, and that is HTML's own rule rather than a shortcut.** A browser
 * treats an unknown `type` as `text`, and so do `month`, `week`, `datetime-local` and `hidden`
 * — all of which have a string `value` and none of which SDD-34 §4.2 enumerates. Falling back
 * to `bindText` is therefore the reading that agrees with the element; the closed list is the
 * REJECTED one, and it is closed on purpose.
 */
function inputBind(type: string | null | undefined): ControlTarget {
  // A `type` the compiler cannot read is not rescued with a runtime dispatch: that dispatch is
  // exactly the table this whole design exists to keep out of the bundle (§4.2).
  if (type === null) return { kind: 'unsupported', reason: 'dynamic-type' };
  if (type === 'file') return { kind: 'unsupported', reason: 'file' };
  if (type !== undefined && NO_VALUE_TYPES.has(type)) return { kind: 'unsupported', reason: 'no-value' };
  if (type !== undefined && NUMERIC_TYPES.has(type)) return { kind: 'value', bind: 'bindNumber' };
  if (type === 'checkbox') return { kind: 'value', bind: 'bindCheckbox' };
  if (type === 'radio') return { kind: 'value', bind: 'bindRadio' };
  return { kind: 'value', bind: 'bindText' };
}

/**
 * Classify one `control` binding by the element it sits on (decision 109).
 *
 * `isComponent` is injected rather than looked up: who is a declared component tag is graph
 * knowledge (decision 41), and this module holds no graph. The semantic pass answers it off
 * the registry and the emit off the resolved graph — the same question, from the two places
 * that can see it.
 */
export function controlTarget(el: ElementNode, isComponent: boolean): ControlTarget {
  // A component tag wins over everything, INCLUDING a name that happens to look native: what
  // decides is the declaration, not the spelling.
  if (isComponent) return { kind: 'component', tag: el.name };
  switch (el.name.toLowerCase()) {
    case 'form':
      return { kind: 'form' };
    case 'input':
      return inputBind(staticType(el));
    case 'textarea':
      return { kind: 'value', bind: 'bindText' };
    case 'select':
      return { kind: 'value', bind: hasMultiple(el) ? 'bindSelectMultiple' : 'bindSelect' };
    default:
      // A `<fieldset>`, a `<div>`, a `<section>` — whatever the author chose. What the binding
      // adds is grouping of errors; where it lands is layout (§4.1).
      return { kind: 'group' };
  }
}

/** Whether this element is a radio input — the one shape decision 110 lets share a node. */
export function isRadio(el: ElementNode): boolean {
  return el.name.toLowerCase() === 'input' && staticType(el) === 'radio';
}
