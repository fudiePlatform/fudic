/**
 * `FudicControlElement` — the base of a control-component (SDD-34 §3.3, §4.5).
 *
 * A component whose `<template shadowrootmode="open" formassociated>` carries the marker
 * extends this instead of `FudicElement`, and what it gains is the three things the standard
 * only grants a form-associated custom element:
 *
 * - **`static formAssociated = true`**, read by the browser when the class is DEFINED. That is
 *   why the marker cannot be anything but a compile-time decision: there is no declarative
 *   form of it, and this SDD does not pretend to invent one — it decides which class the emit
 *   extends, nothing more.
 * - **`ElementInternals`**, created in the constructor because that is the only moment
 *   `attachInternals()` may be called.
 * - **`delegatesFocus`** on its shadow root, without which a `<label for>` outside the
 *   component moves the focus to the host and not to the `<input>` inside it. Losing that is
 *   not an optimisation, it is an accessibility failure.
 *
 * It lives in `@fudic/forms` and not in `@fudic/core`, and that is a direction of dependency
 * rather than a filing decision: this base needs the type `Control<T>`, so `forms` depends on
 * `core` and never the other way round.
 *
 * **The control is picked up from the props, structurally.** §3.3 says the emit writes it, and
 * the emit cannot: what it emits is a STATIC factory, with no instance code to assign a field
 * in. What it does emit is the crossing — the reference the parent named with
 * `control="@f.body"` (decision 112) — into the same positional payload every prop travels in.
 * So the base finds it there, by the shape of a `Control<T>`, and wires the internals to it.
 * That keeps the compiler out of a coupling it does not need: the emit crosses a value, and
 * what the child makes of it is the child's.
 */

import { FudicElement, effect, type Cleanup } from '@fudic/core';
import type { Control } from './types.js';

/**
 * Whether a crossed value is a `Control<T>`.
 *
 * Structural, and it has to be: what arrives is a value in a positional payload, and the
 * payload carries no schema (SDD-15 §4.2). A control is a callable with `set` and `touch` on
 * it — no other shape this package produces answers to all three.
 */
function isControl(value: unknown): value is Control<unknown> {
  if (typeof value !== 'function') return false;
  const candidate = value as Partial<Control<unknown>>;
  return typeof candidate.set === 'function' && typeof candidate.touch === 'function';
}

export abstract class FudicControlElement extends FudicElement {
  /** Read by the browser when the class is defined — which is why the marker is compile-time. */
  static readonly formAssociated = true;

  /** `ElementInternals`, created in the constructor: the only moment it can be. */
  protected readonly internals: ElementInternals;

  /** The node the parent crossed. Filled from the payload as the instance comes alive. */
  protected control: Control<unknown> | null = null;

  #wiring: Cleanup | null = null;

  constructor() {
    super();
    this.internals = this.attachInternals();
  }

  /** `delegatesFocus`, so an outside `<label for>` reaches the `<input>` inside. */
  protected override shadowInit(): ShadowRootInit {
    return { mode: 'open', delegatesFocus: true };
  }

  override h(props: readonly unknown[]): void {
    super.h(props);
    this.#wire(props);
  }

  override c(props: readonly unknown[]): void {
    super.c(props);
    this.#wire(props);
  }

  /**
   * An update may bring a different node — a parent that swapped which control this component
   * edits — so the wiring is redone. It is idempotent: the previous effects are torn down
   * first, and a payload that does not carry a control leaves the current one alone.
   *
   * The array is SPARSE on this path (BUG-18 §4.1): a hole means «unchanged», so a payload
   * with no control in it is not a payload that cleared it.
   */
  override u(props: readonly unknown[]): void {
    super.u(props);
    if (props.some(isControl)) this.#wire(props);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#unwire();
  }

  #unwire(): void {
    this.#wiring?.();
    this.#wiring = null;
  }

  /**
   * Follow the control with the two things `ElementInternals` exists for.
   *
   * `setFormValue` is what makes an OUTSIDE `<form>` — one belonging to an application that is
   * not fudic — pick the value up in its `FormData`. `setValidity` is what gives the host a
   * real `:invalid`, which is the only version of that state a stylesheet can rely on.
   *
   * The anchor of `setValidity` is `this`: a validity message with no anchor cannot be
   * reported, and the host is the element the user can be sent to.
   */
  #wire(props: readonly unknown[]): void {
    const control = props.find(isControl);
    if (control === undefined) return;
    this.#unwire();
    this.control = control;
    const offValue = effect(() => {
      const value = control();
      this.internals.setFormValue(value === null || value === undefined ? null : String(value));
    });
    const offValidity = effect(() => {
      const errors = control.errors();
      if (errors === null) this.internals.setValidity({});
      // The first rule that failed names the state, exactly as the error slot shows it.
      else this.internals.setValidity({ customError: true }, Object.keys(errors)[0] ?? 'invalid', this);
    });
    this.#wiring = () => {
      offValue();
      offValidity();
    };
  }
}
