/**
 * `control-inside-form` (decision 115, SDD-34 §4.1): a `control` binding with no
 * `<form control="…">` above it in the same template.
 *
 * The rule the example was missing, and the reason it was missing is worth writing down. As
 * first specified, `control` bound a node to any element anywhere, so nothing stopped an
 * `<app-input control="@f.alias">` from sitting inside a `<form>` that fudic knows nothing
 * about — a plain HTML form that submits natively and collects its fields in a `FormData`.
 * That arrangement reads like interop and is incoherent: the value the user types lives in
 * `f`, the form the browser submits reads the DOM, and the two only agree because
 * `setFormValue` copies one into the other under a `name` attribute nobody else in the
 * language uses. A model bound to a form that is not the model's form is not a feature.
 *
 * So: a node binds inside ITS form, and nowhere else. What that buys, beyond coherence, is
 * that `name` stops being part of the vocabulary — it was only ever there so a foreign
 * `FormData` could pick the value up.
 *
 * **The exemption is the whole of the cross-file half.** A control-component — a
 * `<template shadowrootmode formassociated>` — binds a node it did not name: the parent hands
 * it over with `control="@f.alias"` (decision 112) and its own template holds the `<input>`,
 * with no `<form>` anywhere near it. Requiring one there would make the pattern the SDD is
 * built around illegal. The parent's crossing site is checked by this same rule, in the file
 * where the `<form>` actually is, so the chain is covered end to end with one lexical
 * question asked twice.
 *
 * The `<form control>` itself is of course allowed: it is the form.
 */

import { errorDiag } from '../../types/index.js';
import { classifyAttribute, isFormAssociated } from '../../binding/index.js';
import type { ElementNode } from '../../html/index.js';
import type { Analyzer } from '../model.js';
import { documentRoots, walk } from '../walk.js';

const FUD_CONTROL_OUTSIDE_FORM = 'FUD0595';

/** The tag a form binding may sit on — HTML's own, not a component that happens to be named so. */
const FORM_TAG = 'form';

/** Whether this element carries a `control` binding at all. */
function bindsControl(el: ElementNode, source: string): boolean {
  return el.attributes.some((attr) => classifyAttribute(attr, source).value.type === 'control');
}

/** Whether this element is the `<form control="…">` that opens a form's scope. */
function opensForm(el: ElementNode, source: string): boolean {
  return el.name === FORM_TAG && bindsControl(el, source);
}

export const controlInsideForm: Analyzer = {
  name: 'control-inside-form',
  run(input, report) {
    // A control-component binds the node its parent handed it, and its template has no form
    // in it by construction. The check that matters for it happened at the crossing site.
    const host = input.document.type === 'component-document' ? input.document.template : undefined;
    if (host !== undefined && isFormAssociated(host)) return;

    // Elements that have a bound `<form>` somewhere above them. Filled as the walk goes,
    // which is enough because `element` fires parents before children: by the time a child is
    // visited its host has already been classified.
    const inside = new WeakSet<ElementNode>();

    walk(documentRoots(input.document), {
      element(el, parent) {
        const under =
          parent !== undefined && (inside.has(parent) || opensForm(parent, input.source));
        if (under) inside.add(el);
        if (under || opensForm(el, input.source)) return;

        for (const attr of el.attributes) {
          if (classifyAttribute(attr, input.source).value.type !== 'control') continue;
          report(
            errorDiag(
              FUD_CONTROL_OUTSIDE_FORM,
              '`control` needs a `<form control="…">` above it: a node binds inside its own form, and a component that binds one it received must mark its template `formassociated`',
              attr.span,
            ),
          );
        }
      },
    });
  },
};
