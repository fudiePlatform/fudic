/**
 * How a case of a fixture is mounted (SDD-66 §4.2): its props as `.prop=@…`, its `$content` as the
 * children and a host for the props that are signals. The workbench writes a page per criterion
 * with it and the showcase a block per case, so if the workbench's pages compile, so does the
 * showcase.
 */

import { isSignal, jsonLiteral } from './host.js';

/** The key of a fixture entry that is not a prop: the component's children. */
export const CONTENT = '$content';

/** One executed case, taken apart. */
export interface CaseShape {
  /** Every prop in fixture order, `$content` aside: the order of the attributes. */
  readonly order: readonly string[];
  /** The props whose value is a signal: a page cannot own one, a host does. */
  readonly signals: readonly string[];
  /** The `$content`, or `''` without one. */
  readonly content: string;
  readonly props: Readonly<Record<string, unknown>>;
}

export function caseShape(values: Readonly<Record<string, unknown>>): CaseShape {
  const { [CONTENT]: children, ...props } = values;
  const order = Object.keys(props);
  return {
    order,
    signals: order.filter((prop) => isSignal(props[prop])),
    content: typeof children === 'string' ? children : '',
    props,
  };
}

/** ` .a=@<read a> .b=@<read b>`: how each prop reaches the component. */
export function propAttrs(order: readonly string[], read: (prop: string) => string): string {
  return order.map((prop) => ` .${prop}=@${read(prop)}`).join('');
}

/** A signal prop with the JSON literal of its initial value, which the host seeds it with. */
export interface SignalLiteral {
  readonly prop: string;
  readonly literal: string;
}

/**
 * The literal of each signal prop of the case, or the first prop whose initial value has none: a
 * host cannot write down what does not come back the same from JSON.
 */
export function signalLiterals(shape: CaseShape): { readonly literals: readonly SignalLiteral[] } | { readonly failed: string } {
  const literals: SignalLiteral[] = [];
  for (const prop of shape.signals) {
    const literal = jsonLiteral((shape.props[prop] as () => unknown)());
    if (literal === undefined) return { failed: prop };
    literals.push({ prop, literal });
  }
  return { literals };
}
