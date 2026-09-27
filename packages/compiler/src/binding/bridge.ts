/**
 * The bridge of a control-component: the id its author's `shadowrootreferencetarget` points at
 * (decision 132, BUG-42 §3.4).
 *
 * A `<label for>` outside a control-component names its HOST, and the input that takes the
 * focus lives in the host's shadow root. Reference Target forwards what points at the host to
 * one element of that root. It is a STANDARD attribute and the AUTHOR writes it: the compiler
 * does not choose a field for them. The day every engine has the bridge, a wrapper written
 * against the standard keeps working untouched — one whose bridge the compiler invented would
 * have to be rewritten by hand when the compiler stops inventing it.
 *
 * What fudic adds is `formassociated`, and the fallback behind it: the parent opens the child's
 * shadow root on the server with the author's target, the client passes it to `attachShadow`,
 * and `FudicControlElement` carries to that same element what the bridge does not forward, or
 * everything where there is no bridge. All of them need the same answer, so it is read here,
 * once, for the emit and for the semantic pass that reports a target the compiler cannot see.
 */

import type { Span } from '../types/index.js';
import type { Attribute, ElementNode } from '../html/index.js';
import { isFormAssociated } from './control.js';
import { staticId, walkBlocks } from './markers.js';

/** The standard attribute of a declarative shadow root that sets its reference target. */
export const REFERENCE_TARGET_ATTR = 'shadowrootreferencetarget';

export interface Bridge {
  /** The id the bridge points at: the author's. */
  readonly id: string;
}

export interface BridgeProblem {
  readonly code: 'FUD0605';
  readonly message: string;
  readonly span: Span;
}

export interface BridgeResult {
  /** `null` for a template that is not `formassociated`, or whose author wrote no target. */
  readonly bridge: Bridge | null;
  readonly problems: readonly BridgeProblem[];
}

const NONE: BridgeResult = { bridge: null, problems: [] };

function attribute(el: ElementNode, name: string): Attribute | undefined {
  return el.attributes.find((a) => typeof a.name === 'string' && a.name.toLowerCase() === name);
}

/** The literal text of an attribute, or `undefined` when an `@` makes it dynamic. */
function literal(attr: Attribute): string | undefined {
  let text = '';
  for (const part of attr.value) {
    if (part.type !== 'attribute-text') return undefined;
    text += part.value;
  }
  return text;
}

/** The bridge of the root `<template>` of a component. */
export function bridgeOf(template: ElementNode): BridgeResult {
  if (!isFormAssociated(template)) return NONE;
  const written = attribute(template, REFERENCE_TARGET_ATTR);
  if (written === undefined) return NONE;

  const ids = new Set<string>();
  walkBlocks(template.children, (el) => {
    const id = staticId(el);
    if (typeof id === 'string') ids.add(id);
  });
  const id = literal(written);
  if (id === undefined || !ids.has(id)) {
    return {
      bridge: null,
      problems: [
        {
          code: 'FUD0605',
          message: `\`${REFERENCE_TARGET_ATTR}\` must be a static id of an element of this template: the bridge points at an element the compiler can see`,
          span: written.span,
        },
      ],
    };
  }
  return { bridge: { id }, problems: [] };
}
