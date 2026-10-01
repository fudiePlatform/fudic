/**
 * `form-associated-placement` (decision 111, SDD-34 §4.5): `formassociated` belongs to the
 * ROOT `<template shadowrootmode>` of a component, and nowhere else.
 *
 * What the marker decides is what the emitted CLASS is — which base it extends, whether its
 * shadow root delegates focus, and whether its tag joins the page map's `eager` list. All three
 * are facts about the component, and a component has exactly one template that is its own
 * (decision 75.a). On a nested `<template>` there is no class to decide anything about; in page
 * mode there is no component at all. Both would be markers that say nothing, and a marker that
 * silently says nothing is worse than one that is rejected — the author would be left believing
 * their `<label for>` works.
 *
 * On the root template it also reports what the bridge to the field cannot be (BUG-42 §3.6).
 *
 * Only `<template>` elements are examined. `formassociated` on any other element is an unknown
 * attribute like any other, and the compiler does not own the author's vocabulary outside the
 * one place it reads this word.
 */

import { FUD0593 } from '@fudic/diagnostics';
import { adoptedStylesOf, bridgeOf, FORM_ASSOCIATED_ATTR } from '../../binding/index.js';
import type { Attribute, ElementNode } from '../../html/index.js';
import type { Analyzer } from '../model.js';
import { documentRoots, walk } from '../walk.js';

/** The one template a component may mark: its own (`ComponentDocument.template`). */
function rootTemplate(document: { readonly type: string }): ElementNode | undefined {
  return document.type === 'component-document'
    ? (document as { readonly template?: ElementNode }).template
    : undefined;
}

/**
 * The marker attribute, so the diagnostic points at the WORD and not at the whole tag. Looked
 * up rather than asked for as a boolean: a rule that has to blame the marker needs the marker,
 * and `isFormAssociated` would leave it re-deriving a span it could not fail to find.
 */
function marker(el: ElementNode): Attribute | undefined {
  return el.attributes.find(
    (a) => typeof a.name === 'string' && a.name.toLowerCase() === FORM_ASSOCIATED_ATTR,
  );
}

export const formAssociatedPlacement: Analyzer = {
  name: 'form-associated-placement',
  run(input, report) {
    const root = rootTemplate(input.document);
    // The bridge its author wrote on the root template — any component's — has to name an element
    // of that template (decision 132): reported with the same function the emit reads it with
    // (`FUD0605`).
    if (root !== undefined) {
      for (const problem of bridgeOf(root).problems) report(problem);
      // And the sheets it chooses have to be a literal list (`FUD0745`); whether each name
      // exists is the host's, which holds the `fudic.json`.
      for (const problem of adoptedStylesOf(root).problems) report(problem);
    }
    walk(documentRoots(input.document), {
      element(el) {
        if (el === root || el.name.toLowerCase() !== 'template') return;
        const at = marker(el);
        if (at === undefined) return;
        report(FUD0593({ span: at.span }));
      },
    });
  },
};
