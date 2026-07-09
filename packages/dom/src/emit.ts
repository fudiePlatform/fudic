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

/**
 * Public developer surface. The `this`-bound host is erased from this type on
 * purpose — the compiler supplies it via `emit.call(host, …)`.
 */
export const emit = emitImpl as (name: string, detail?: unknown) => void;
