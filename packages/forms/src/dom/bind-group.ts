/**
 * `bindGroup` — a group of fields, on whatever element the author chose (SDD-34 §4.1,
 * decision 109).
 *
 * There is no privileged element: a `<fieldset>`, a `<div>` and a `<section>` are all the same
 * to this. What the binding adds is the SEMANTICS of grouping — this region of the form is the
 * one that is wrong — and where that region falls on the screen is layout, settled with CSS.
 *
 * A group has no `touched` of its own, and it does not need one: its errors are published by
 * `$validate` or by a `$setErrors` from a 422, and both of those are moments at which the user
 * has already acted. The per-field rule of §4.2 — do not paint an error at a field the user has
 * not reached — is about a field.
 */

import { effect } from '@fudic/core';
import type { AnyForm } from '../types.js';
import { bindSummary } from './summary.js';
import type { Cleanup, ErrorSlot } from './types.js';
import { undo } from './wiring.js';

/**
 * `summary` is the element the author marked with `summary="@group"`, or `null`: what it holds
 * is the group's OWN errors, as a list — and with `fields` (`links`), the visible errors of its
 * fields after a submit too (BUG-42 §4.6, §4.7).
 */
export function bindGroup(
  el: HTMLElement,
  group: AnyForm,
  summary: ErrorSlot = null,
  links: Readonly<Record<string, string>> | null = null,
): Cleanup {
  const offs: Cleanup[] = [
    effect(() => {
      const errors = group.$errors();
      const invalid = (errors !== null && Object.keys(errors).length > 0) || group.$summary() !== null;
      if (invalid) el.setAttribute('aria-invalid', 'true');
      else el.removeAttribute('aria-invalid');
    }),
  ];
  if (summary !== null) offs.push(bindSummary(summary, group, links));
  return undo(offs);
}
