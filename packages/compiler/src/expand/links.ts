/**
 * Reading a `<link rel="snippet">` (SDD-29 §4.3).
 *
 * Two attributes and one asymmetry worth stating, because it is deliberate and it bites:
 * `as` on a `rel="component"` renames a TAG and is inferred from the filename when absent,
 * while `as` here means NAMESPACE and is never inferred. Same attribute, different meaning
 * per `rel`. Without `as` the names land in the global scope; with it, and only with it,
 * they are reached as `@render form.card(…)`.
 *
 * The `href` is read verbatim (SDD-43 §4.3): no `@`-construct is recognized in it, so
 * `@acme/ui/helpers.fud` is the package specifier the author wrote and not the interpolation
 * of a variable called `acme`.
 */

import type { Attribute, ElementNode } from '../html/index.js';

/** What one `<link rel="snippet">` says. */
export interface SnippetLink {
  /** The element, for the span every diagnostic about this import points at. */
  readonly el: ElementNode;
  /** The `href`, verbatim. Empty when absent — which is `FUD0836`. */
  readonly href: string;
  /** The `as` namespace. Absent means the global scope, and is NOT inferred. */
  readonly namespace?: string;
}

/** The first attribute whose name is the literal `name` (a dynamic name never matches). */
function attr(el: ElementNode, name: string): Attribute | undefined {
  return el.attributes.find((a) => typeof a.name === 'string' && a.name === name);
}

/** The statically decidable value of an attribute, or `undefined` when any part is dynamic. */
function staticValue(a: Attribute | undefined): string | undefined {
  if (a === undefined) return undefined;
  let out = '';
  for (const part of a.value) {
    if (part.type !== 'attribute-text') return undefined;
    out += part.value;
  }
  return out;
}

/**
 * The statically decidable value of an attribute of an element, or `undefined`.
 *
 * Shared with the expansion, which reads the `href` of a component link the same way when it
 * drags one (§4.5) — one reading of "an attribute the compiler can act on", not two.
 */
export function staticAttribute(el: ElementNode, name: string): string | undefined {
  return staticValue(attr(el, name));
}

/** Read one import. Never throws: an absent `href` comes back empty and is reported later. */
export function readSnippetLink(el: ElementNode): SnippetLink {
  const href = staticAttribute(el, 'href') ?? '';
  const namespace = staticAttribute(el, 'as');
  return {
    el,
    href,
    ...(namespace !== undefined && namespace !== '' ? { namespace } : {}),
  };
}
