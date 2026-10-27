/**
 * The host component for `Signal` props. A page cannot own a signal it hands down to a child,
 * so when a fixture value is a signal the workbench writes a component that owns one, seeded
 * with the fixture's initial value written down literally, and mounts that instead.
 */

import { isDeepStrictEqual } from 'node:util';
import { fixtureOf } from './access.js';

/** A signal as the fixture holds it: a function with a `set` method. */
export interface SignalLike {
  (): unknown;
  set(value: unknown): void;
}

export function isSignal(value: unknown): value is SignalLike {
  return typeof value === 'function' && typeof (value as { set?: unknown }).set === 'function';
}

/** The JSON literal of a value, or undefined when it does not come back the same. */
export function jsonLiteral(value: unknown): string | undefined {
  const json = JSON.stringify(value) as string | undefined;
  return json !== undefined && isDeepStrictEqual(JSON.parse(json), value) ? json : undefined;
}

export interface HostInput {
  /** The host's own tag, `bench-host-<slug>`. */
  readonly tag: string;
  /** Absolute path of the component under test, forward slashes. */
  readonly component: string;
  readonly componentTag: string;
  /** Import specifier of the fixture (no `.ts`) and the entry; read only when `forwarded`. */
  readonly fixture: { readonly specifier: string; readonly name: string };
  /** The signal props, with their initial value as a JSON literal. */
  readonly signals: readonly { readonly prop: string; readonly literal: string }[];
  /** The other props, forwarded from the fixture. */
  readonly forwarded: readonly string[];
  /** Every prop in fixture order: the order of the attributes. */
  readonly order: readonly string[];
  /** The fixture's `$content`: the component's children. */
  readonly content: string;
}

export function hostComponent(input: HostInput): string {
  const imports =
    input.forwarded.length === 0
      ? '\n'
      : `  import fixtures from "${input.fixture.specifier}";\n\n` +
        `  const { ${input.forwarded.join(', ')} } = ${fixtureOf(input.fixture.name)};\n\n`;
  const signals = input.signals.map((s) => `  const ${s.prop} = signal(${s.literal});\n`).join('');
  const attrs = input.order.map((prop) => ` .${prop}=@${prop}`).join('');
  return (
    `<link rel="component" href="${input.component}">\n\n` +
    // One `@code`, browser code (SDD-60 §4.8): the signals the markup reads are the browser's.
    `@code {\n  import { signal } from "@fudic/core";\n${imports}${signals}}\n\n` +
    `<${input.tag}>\n  <template shadowrootmode="open">\n` +
    `    <${input.componentTag}${attrs}>${input.content}</${input.componentTag}>\n` +
    `  </template>\n</${input.tag}>\n`
  );
}
