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

import { errorDiag, span, type Span } from '../../types/index.js';
import type { Attribute } from '../../html/index.js';
import type { Analyzer, ComponentDeclaredProps, MarkupInput, Report } from '../model.js';
import { documentRoots, walk } from '../walk.js';

const FUD_MISSING_REQUIRED_PROP = 'FUD0197';
const FUD_UNKNOWN_PROP = 'FUD0198';

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

/** `` `.a`, `.b` `` — the missing names as the author would have to write them. */
function listed(props: readonly ComponentDeclaredProps[]): string {
  return props.map((prop) => `\`.${prop.name}\``).join(', ');
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
        report(
          errorDiag(FUD_UNKNOWN_PROP, `\`${el.name}\` declares no property \`${prop.name}\``, prop.at),
        );
      }

      const passed = new Set(written.map((prop) => prop.name));
      const missing = declared.filter((d) => d.required && !passed.has(d.name));
      if (missing.length === 0) return;
      report(
        errorDiag(FUD_MISSING_REQUIRED_PROP, `\`${el.name}\` requires ${listed(missing)}`, el.openSpan),
      );
    },
  });
}

export const componentProps: Analyzer = {
  name: 'component-props',
  run: checkComponentProps,
};
