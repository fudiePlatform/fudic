/**
 * `form-associated-placement` (decision 109, SDD-34 §4.5): `formassociated` belongs to the
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
 * Only `<template>` elements are examined. `formassociated` on any other element is an unknown
 * attribute like any other, and the compiler does not own the author's vocabulary outside the
 * one place it reads this word.
 */

import { errorDiag } from '../../types/index.js';
import { FORM_ASSOCIATED_ATTR } from '../../binding/index.js';
import type { Attribute, ElementNode } from '../../html/index.js';
import type { Analyzer } from '../model.js';
import { documentRoots, walk } from '../walk.js';

const FUD_FORM_ASSOCIATED_PLACEMENT = 'FUD0593';

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
    walk(documentRoots(input.document), {
      element(el) {
        if (el === root || el.name.toLowerCase() !== 'template') return;
        const at = marker(el);
        if (at === undefined) return;
        report(
          errorDiag(
            FUD_FORM_ASSOCIATED_PLACEMENT,
            '`formassociated` belongs to the root `<template shadowrootmode>` of a component: it decides the emitted class, and there is none here',
            at.span,
          ),
        );
      },
    });
  },
};
