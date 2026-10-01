/**
 * `component-props` — a host has to pass what its child requires, and may only pass what the
 * child declares (BUG-23 §4.4).
 *
 *  - **`FUD0197`** a required prop nobody passed, over the opening tag of the host.
 *  - **`FUD0198`** a `.prop` the child does not declare, over the name.
 *
 * The rule only runs where the child can actually be READ. `propsOf` is optional on the
 * registry and `undefined` is its honest answer for a tag whose file this pass never resolved:
 * a build that cannot see the child invents no error, and the language server — where
 * TypeScript already checks both things over the projection, with the real type and without
 * this pass having to reimplement structural assignability — supplies no `propsOf` at all and
 * gets silence, not a second copy of every error.
 *
 * `required` means the key of `props<T>()`'s `T` carries no `?`, which is the very thing the
 * projection's `$Missing` asks of the same type. A default in the destructuring does NOT make
 * a prop optional here: the two readers have to say the same, and the type is what the editor
 * reads (BUG-23 §5).
 */

import { FUD0197, FUD0198 } from '@fudic/diagnostics';
import { span, type Span } from '../../types/index.js';
import type { Attribute } from '../../html/index.js';
import { CONTROL_NAME, CONTROL_PROP } from '../../binding/index.js';
import type { Analyzer, MarkupInput, Report } from '../model.js';
import { documentRoots, walk } from '../walk.js';

/** The `.` that makes an attribute a property binding (decision 23). */
const PROPERTY_PREFIX = '.';

/**
 * Span of the attribute NAME. SDD-05 keeps no separate one, but a literal name is always the
 * head of the attribute, so it ends `name.length` characters in.
 */
function nameSpan(attr: Attribute, name: string): Span {
  return span(attr.span.start, Math.min(attr.span.start + name.length, attr.span.end));
}

/** The `.prop` names written on an element, in source order and without the leading `.`. */
function writtenProps(attributes: readonly Attribute[]): readonly { name: string; at: Span }[] {
  const out: { name: string; at: Span }[] = [];
  for (const attr of attributes) {
    if (typeof attr.name !== 'string' || !attr.name.startsWith(PROPERTY_PREFIX)) continue;
    const propName = attr.name.slice(PROPERTY_PREFIX.length);
    // `.` with nothing after it is FUD0093's, not this rule's: there is no name to judge.
    if (propName.length > 0) out.push({ name: propName, at: nameSpan(attr, attr.name) });
  }
  return out;
}

/** The rule itself, over markup alone: the semantic pass and the build both call this. */
export function checkComponentProps(input: MarkupInput, report: Report): void {
  const { components } = input;
  const propsOf = components.propsOf?.bind(components);
  if (propsOf === undefined) return;

  // A component's own host wrapper is its IDENTITY (decision 75), not a use of itself: it
  // carries the tag so the file declares what it is, and nobody passes props to it there.
  const ownHost = input.document.type === 'component-document' ? input.document.host : undefined;

  walk(documentRoots(input.document), {
    element(el) {
      if (el === ownHost) return;
      const declared = propsOf(el.name);
      if (declared === undefined) return;

      const written = writtenProps(el.attributes);
      for (const prop of written) {
        if (declared.some((d) => d.name === prop.name)) continue;
        report(FUD0198({ span: prop.at, tag: el.name, prop: prop.name }));
      }

      const passed = new Set(written.map((prop) => prop.name));
      // `control="@f.body"` on a component tag IS the `ctrl` prop (decision 112) — the one way
      // to cross a node, since only a reference survives hydration. Leaving it out made this
      // rule demand `.ctrl` from exactly the author who had just passed it correctly, which the
      // projection already knew not to do.
      if (el.attributes.some((a) => typeof a.name === 'string' && a.name === CONTROL_NAME)) {
        passed.add(CONTROL_PROP);
      }
      const missing = declared.filter((d) => d.required && !passed.has(d.name));
      if (missing.length === 0) return;
      report(FUD0197({ span: el.openSpan, tag: el.name, missing: missing.map((d) => d.name) }));
    },
  });
}

export const componentProps: Analyzer = {
  name: 'component-props',
  run: checkComponentProps,
};
