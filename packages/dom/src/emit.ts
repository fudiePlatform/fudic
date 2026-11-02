/**
 * `emit` — the single emission point for fudic bus events
 * (SDD-bus-eventos-hidratacion-dirigida §3.1, §5.1).
 *
 * **Developer surface is deliberately just `(name, detail?)`** — the channel name
 * and an optional detail, nothing else. The host is NEVER part of the type the
 * developer imports into `@client`: exposing it (as a `host` parameter or a
 * visible `this`) would leak a compiler concern into user code and confuse
 * everyone. The compiler injects the host, invisibly: inside a compiled `@client`,
 * `emit('carrito', p)` is rewritten to `emit.call(host, 'carrito', p)`, so the host
 * arrives as `this`. The exported type stays honest: only channel + detail.
 *
 * `emit` FORCES `bubbles: true` and `composed: true` so the event climbs the tree
 * and crosses shadow boundaries up to the page-level capturing runtime; the
 * developer never manages propagation nor the shadow crossing. Raw
 * `host.dispatchEvent(...)` stays valid DOM but does NOT participate in directed
 * hydration — only calls routed through `emit` are recognised as bus emissions.
 */
function emitImpl(this: EventTarget, name: string, detail?: unknown): void {
  this.dispatchEvent(
    new CustomEvent(name, { detail, bubbles: true, composed: true }),
  );
}

declare global {
  /**
   * One entry per typed `bus:` receiver of the project, written by the editor's projection of
   * each `.fud`: `'<file>#<n>': readonly ['<name>', <what the handler takes>]`. The name rides
   * in the value and not in the key, so two receivers of one name add up instead of clashing.
   * A name only a library listens to can be registered by hand the same way.
   */
  interface FudicBusReceivers {}
}

type Entry = FudicBusReceivers[keyof FudicBusReceivers];
type Fns<K> = Entry extends infer E ? (E extends readonly [K, infer P] ? (x: P) => void : never) : never;

/**
 * What `emit(name, detail)` must send: what EVERY receiver of `name` accepts — the
 * intersection of their parameters, since they all receive the same object. A name nobody
 * registers accepts anything.
 */
export type BusDetail<K extends string> =
  [Fns<K>] extends [never] ? unknown : Fns<K> extends (x: infer I) => void ? I : never;

/** The detail a handler takes: its first parameter, or `unknown` if it takes none. */
export type BusParam<F> = F extends (...a: infer A) => unknown ? (A extends [] ? unknown : A[0]) : unknown;

/** The detail of `emit`, optional exactly when every receiver of `name` admits `undefined`. */
export type BusArgs<K extends string> =
  undefined extends BusDetail<K> ? [detail?: BusDetail<K>] : [detail: BusDetail<K>];

/**
 * Public developer surface. The `this`-bound host is erased from this type on
 * purpose — the compiler supplies it via `emit.call(host, …)`.
 */
export const emit = emitImpl as <K extends string>(name: K, ...detail: BusArgs<K>) => void;
