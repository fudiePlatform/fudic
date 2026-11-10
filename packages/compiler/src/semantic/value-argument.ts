/**
 * `$value` (SDD-80 §3.5, decision 178): which control a handler's `$value` reads, the type it has,
 * and the three ways there is none to read.
 *
 * Like `$event` it belongs to the compiler, and it only exists in the arguments of an event
 * binding's call. Without delegation the control is the element that carries the `@event`; with
 * it, the elements marked `delegate:<row>` that serve that handler — never the event's `target`,
 * which could be a child of theirs. Each one gives its value through the same readers `control=`
 * binds with (`valueOf`), so the type is static, and a handler served by marks of two types has
 * no single one (`FUD1464`).
 *
 * The decision is made once, inside the plan of the delegation, because the marks it reads are
 * the pairing's: the analyzer turns it into diagnostics, the emit into the reader it writes in
 * line, and the projection into the type of `const $value`.
 */

import { FUD1462, FUD1463, FUD1464 } from '@fudic/diagnostics';
import { valueOf, type ValueReader } from '../binding/control.js';
import type { Attribute, ElementNode } from '../html/index.js';
import type { Diagnostic, Span } from '../types/index.js';

/** The name, as the arguments write it. */
export const VALUE_ARGUMENT = '$value';

/** One handler whose call mentions `$value`. */
export interface ValueSite {
  readonly attr: Attribute;
  readonly element: ElementNode;
  /**
   * Where the handler sits when it can have no control at all: `bus:alta`, `@fudic:result`.
   * Absent for an ordinary `@event`.
   */
  readonly noControl?: string;
  /** The first `$value` of its arguments: where every diagnostic of the site points. */
  readonly at: Span;
}

/** The marks a delegated handler is served by, and the row they hand over. */
export interface Served {
  /** The event as written, `change` or `click.borrar`: what `FUD1464` names. */
  readonly event: string;
  readonly name: string;
  readonly elements: readonly ElementNode[];
}

/** What every `$value` reads, by the attribute of its handler, and what could not be read. */
export interface ValuePlan {
  readonly values: ReadonlyMap<Attribute, ValueReader>;
  readonly diagnostics: readonly Diagnostic[];
}

/** `<div>`: how a diagnostic names an element. */
const tagOf = (el: ElementNode): string => `<${el.name}>`;

/** The reader of each site, from its own element or, delegated, from the marks that serve it. */
export function planValues(sites: readonly ValueSite[], servedBy: (attr: Attribute) => Served | undefined): ValuePlan {
  const values = new Map<Attribute, ValueReader>();
  const diagnostics: Diagnostic[] = [];
  for (const site of sites) {
    if (site.noControl !== undefined) {
      diagnostics.push(FUD1462({ span: site.at, where: site.noControl }));
      continue;
    }
    const served = servedBy(site.attr);
    const elements = served?.elements ?? [site.element];
    const found = elements.map((el) => ({ el, value: valueOf(el) }));
    const none = found.find((f) => f.value.kind === 'none');
    if (none !== undefined) {
      diagnostics.push(FUD1462({ span: site.at, where: tagOf(none.el) }));
      continue;
    }
    const readers = found.flatMap((f) => (f.value.kind === 'value' ? [f.value] : []));
    if (readers.length < found.length) {
      diagnostics.push(FUD1463({ span: site.at }));
      continue;
    }
    const types = [...new Set(readers.map((r) => r.type))];
    if (types.length > 1) {
      // Only marks of a delegated handler can disagree: an element has one value.
      diagnostics.push(FUD1464({ span: site.at, event: served!.event, name: served!.name, types }));
      continue;
    }
    values.set(site.attr, readers[0]!);
  }
  return { values, diagnostics };
}
