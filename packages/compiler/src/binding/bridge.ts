/**
 * The bridge of a control-component: which element of its template is its FIELD, and the id
 * that `shadowrootreferencetarget` points at (decision 132, BUG-42 §3.4).
 *
 * A `<label for>` outside a control-component names its HOST, and the input that takes the
 * focus lives in the host's shadow root. Reference Target forwards what points at the host to
 * one element of that root; the compiler writes it — `shadowrootreferencetarget` on the server,
 * `referenceTarget` on the client — and `FudicControlElement` carries to the same element what
 * the bridge does not forward. Both need the same answer, so it is computed here, once, for the
 * emit and for the semantic pass that reports what cannot be bridged.
 *
 * The field is the element that carries `control=`, or the container of its radios. Its id is
 * the author's static one, or `fud-field` when they wrote none: the ids of a shadow root are
 * local to it, so a fixed id serves every instance.
 */

import type { Span } from '../types/index.js';
import type { Attribute, ElementNode } from '../html/index.js';
import { classifyAttribute } from './classify.js';
import { isFormAssociated, isRadio } from './control.js';
import { idAttribute, staticId, walkBlocks } from './markers.js';

/** The standard attribute of a declarative shadow root that sets its reference target. */
export const REFERENCE_TARGET_ATTR = 'shadowrootreferencetarget';

/** The id the compiler gives a field whose author wrote none. */
export const DERIVED_FIELD_ID = 'fud-field';

export interface Bridge {
  /** The id the bridge points at. */
  readonly id: string;
  /** The element that carries it, when the compiler chose it; `null` when the author named it. */
  readonly field: ElementNode | null;
  /** Whether the compiler writes `id` on the field: its author wrote none. */
  readonly writesId: boolean;
}

export interface BridgeProblem {
  readonly code: 'FUD0603' | 'FUD0604' | 'FUD0605';
  readonly message: string;
  readonly span: Span;
}

export interface BridgeResult {
  /** `null` for a template that is not `formassociated`, or that binds nothing. */
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

/** Whether an element can carry what the relay gives a radio group: a fieldset or a radiogroup. */
function groupsRadios(el: ElementNode): boolean {
  if (el.name.toLowerCase() === 'fieldset') return true;
  const role = attribute(el, 'role');
  return role !== undefined && literal(role) === 'radiogroup';
}

/** The bridge of the root `<template>` of a component. */
export function bridgeOf(template: ElementNode, source: string): BridgeResult {
  if (!isFormAssociated(template)) return NONE;

  const ids = new Set<string>();
  let control: { el: ElementNode; attr: Attribute; ancestors: readonly ElementNode[] } | undefined;
  walkBlocks(template.children, (el, _block, _inLoop, ancestors) => {
    const id = staticId(el);
    if (typeof id === 'string') ids.add(id);
    if (control !== undefined) return;
    const attr = el.attributes.find((a) => classifyAttribute(a, source).value.type === 'control');
    if (attr !== undefined) control = { el, attr, ancestors };
  });

  // The author's own target wins, and it has to name an element the compiler can see.
  const written = attribute(template, REFERENCE_TARGET_ATTR);
  if (written !== undefined) {
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
    return { bridge: { id, field: null, writesId: false }, problems: [] };
  }

  if (control === undefined) return NONE;

  let field = control.el;
  if (isRadio(control.el)) {
    const container = [...control.ancestors].reverse().find(groupsRadios);
    if (container === undefined) {
      return {
        bridge: null,
        problems: [
          {
            code: 'FUD0603',
            message:
              'the radios of a control-component need a `<fieldset>` or an element with `role="radiogroup"` around them: it is what the label and the description are carried to',
            span: control.attr.span,
          },
        ],
      };
    }
    field = container;
  }

  const id = staticId(field);
  if (id === undefined) {
    return {
      bridge: null,
      problems: [
        {
          code: 'FUD0604',
          message: 'the field of a control-component needs a static `id`, or none: the bridge has to point at an id the compiler knows',
          span: idAttribute(field)!.span,
        },
      ],
    };
  }
  return {
    bridge: { id: id ?? DERIVED_FIELD_ID, field, writesId: id === null },
    problems: [],
  };
}
