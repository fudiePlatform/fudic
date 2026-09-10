/**
 * `SsrDom` — the build adapter (SDD-14 §3.2, §4.3). Implements ONLY `Dom<SsrNode>`
 * (the construction contract), building a detached tree. It does NOT implement
 * `DomClient`: in SSR there is no hydration and no in-place reactive mutation, so
 * there is no traversal or `setText`/`setProp` to offer — and therefore no method
 * that throws. The inability to hydrate in SSR is a property of the type.
 *
 * Parent→child props are resolved by the SSG passing values into the child's
 * `ctx`, not via DOM properties; that is why `setProp` is not part of this
 * contract at all.
 *
 * It also collects the page's hydration payload — `claim`, `state`,
 * `hydrationState` (SDD-15 §3.1, §3.3) — and those are NOT in `Dom<N>` on
 * purpose. Only the server assigns identity: the client's `h` path READS the
 * `data-fud-id` the parser left in the DOM and never writes one. A method on
 * the shared contract would be a signature `browserDom` had to implement in
 * order never to call it.
 */

import { type Dom, type Ns } from '@fudic/dom';
import { type SsrNode, SsrNodeImpl, asImpl } from './tree.js';

/** The identity attribute of a hydratable instance (SDD-15 §3.1). */
export const ID_ATTR = 'data-fud-id';

/**
 * The state payload of one rendered page: `offsets` of length `n+1` and the flat `data`
 * (SDD-15 §3.3). `offsets[id]` opens the slice of instance `id` and `offsets[id+1]` closes
 * it, so the id IS the index and there is no intermediate table.
 */
export interface HydrationState {
  readonly offsets: readonly number[];
  readonly data: readonly unknown[];
}

/**
 * One CELL an instance publishes: something parent and child have to end up holding the very
 * same object of (BUG-24 §4.2).
 *
 * Two fields and the difference between them is the whole of `$` versus `$f`. `of` is the
 * live thing — the signal, or the function — and it is only ever an IDENTITY here: the server
 * never calls it, it registers it, so that anyone who later serialises that same object writes
 * its address instead. `value` is what the slot carries, and a cell that has none is a
 * callback: `@code { @client }` does not run on this side, so there is nothing to write down.
 */
export interface CellDecl {
  readonly of: unknown;
  readonly value?: unknown;
}

/**
 * The marker a consumer's slot carries in place of the value: the address of the cell.
 *
 * It is a WIRE format, not a shared type — `@fudic/core` declares the same two shapes at the
 * reading end and the two packages depend on neither each other nor a third. That is the same
 * arrangement `fud-state` itself already has, and it is what keeps the runtime out of the
 * server's dependency graph.
 */
type CellRef = readonly [owner: number, slot: number];
type CellMark = { readonly $: CellRef } | { readonly $f: CellRef };

export class SsrDom implements Dom<SsrNode> {
  /**
   * The id given to each claimed host, and the slice reserved for it. Two structures, one
   * counter: `#slices.length` IS the next id, so they cannot come apart.
   */
  readonly #ids = new WeakMap<SsrNodeImpl, number>();
  readonly #slices: (readonly unknown[])[] = [];

  /**
   * Every cell published so far, by the live object it is a cell OF.
   *
   * Keyed by identity and not by name, and that is what makes forwarding work for free: a
   * component that hands a prop it received on to a grandchild is holding the very object its
   * own parent held, so the address it serialises is the ORIGINAL owner's. A name would have
   * had to be requalified at every hop, and one hop that forgot would mint a second cell for
   * one signal — the exact bug BUG-24 exists to prevent.
   */
  readonly #cells = new Map<unknown, CellMark>();

  /**
   * Take the next `data-fud-id` for a hydratable host, and RESERVE its slice.
   *
   * Identity is assigned while RENDERING and not while compiling: a `@foreach` over
   * `data.items` produces N instances that only exist once the data arrives, so the single
   * pre-order pass SDD-15 §3.2 asks for is this one — the emitter fabricates a host before
   * it descends into its shadow, and the counter lives here.
   *
   * Reserving the slice is what keeps the two halves square. The id is known by the PARENT,
   * which builds the host; the values are known by the CHILD, in its own `render`. If they
   * were two counters, a hydratable child whose `render` never called `state` would shift
   * every following offset by one. With the reservation that case is an empty slice
   * (`offsets[id] === offsets[id+1]`), which is exactly what it means.
   *
   * A host already claimed is not renumbered: the id is the node's, not the call's.
   */
  claim(host: SsrNode): void {
    const h = asImpl(host);
    if (this.#ids.has(h)) return;
    this.#ids.set(h, this.#slices.length);
    h.attrs.set(ID_ATTR, String(this.#slices.length));
    this.#slices.push([]);
  }

  /**
   * Fill the slice of the host that owns `shadow` with the values its `render` destructured.
   *
   * The link is `attachShadow`'s: it leaves `shadow.parent = host`, so the adapter can go
   * from the one thing the child holds to the one thing the parent named. A shadow whose
   * host was never claimed — the emit's own hydration harness calls `render` with a shadow
   * made by hand — has no slice, and filling nothing is the honest answer.
   *
   * ## The cells go BEHIND the props (BUG-24 §4.2)
   *
   *     slice = [ ...values, ...cells ]
   *
   * so no index that exists today moves, and a component with no cell serialises exactly the
   * bytes it serialised before. Two things happen here and the order between them matters:
   * every cell is REGISTERED first, under the address it is about to occupy, and only then are
   * the values written down — because a value may itself BE a cell somebody published earlier,
   * and what goes in the slot then is its marker, not the live object it could never be.
   *
   * That substitution is the whole of the client's half. The child's slot says «my value is
   * that cell», the runtime resolves it before handing the slice over, and parent and child
   * end up holding one object because nobody ever built a second one.
   */
  state(
    shadow: SsrNode,
    values: readonly unknown[],
    cells: readonly CellDecl[] = [],
    ioc?: number,
  ): void {
    const host = asImpl(shadow).parent;
    const id = host === null ? undefined : this.#ids.get(host);
    if (id === undefined) return;
    cells.forEach((cell, i) => {
      const ref: CellRef = [id, values.length + i];
      // No value to serialise is not a degenerate cell, it is a CALLBACK — and `$f` is what
      // tells the runtime it has to raise the owner before it can hand this slice over.
      this.#cells.set(cell.of, 'value' in cell ? { $: ref } : { $f: ref });
    });
    this.#slices[id] = [
      ...values.map((value) => this.#cells.get(value) ?? value),
      // JSON has no `undefined`: a callback's reserved slot is written as `null`, which is
      // exactly what «reserved, with nothing in it» has to look like on the wire.
      ...cells.map((cell) => cell.value ?? null),
      // The container's node, LAST — behind the props and behind the cells, so no index
      // that exists today moves (SDD-38 §4.5). A number and not a container: what crosses
      // the wire are values, and the browser rebuilds the tree from the published map.
      ...(ioc === undefined ? [] : [ioc]),
    ];
  }

  /**
   * The payload accumulated so far. The offsets are computed HERE, as prefix sums over the
   * slices in id order, and never maintained incrementally: a child finishes its `render`
   * before a later sibling claims its own id, so the order slices ARRIVE in is not the order
   * of the ids. The order of the reservations is.
   */
  hydrationState(): HydrationState {
    const offsets: number[] = [0];
    const data: unknown[] = [];
    for (const slice of this.#slices) {
      data.push(...slice);
      offsets.push(data.length);
    }
    return { offsets, data };
  }

  element(tag: string, ns: Ns = 'html'): SsrNode {
    return SsrNodeImpl.element(tag, ns);
  }
  text(data: string): SsrNode {
    return SsrNodeImpl.leaf('text', data);
  }
  comment(data: string): SsrNode {
    return SsrNodeImpl.leaf('comment', data);
  }

  setAttr(el: SsrNode, name: string, value: string): void {
    asImpl(el).attrs.set(name, value);
  }
  removeAttr(el: SsrNode, name: string): void {
    asImpl(el).attrs.delete(name);
  }

  append(parent: SsrNode, child: SsrNode): void {
    const p = asImpl(parent);
    const c = asImpl(child);
    detach(c);
    c.parent = p;
    p.children.push(c);
  }

  before(anchor: SsrNode, node: SsrNode): void {
    const a = asImpl(anchor);
    const n = asImpl(node);
    const p = a.parent;
    if (p === null) {
      return; // an un-parented anchor has no sibling order to insert into
    }
    detach(n);
    n.parent = p;
    p.children.splice(p.children.indexOf(a), 0, n);
  }

  remove(node: SsrNode): void {
    detach(asImpl(node));
  }

  attachShadow(host: SsrNode, delegatesFocus = false): SsrNode {
    const h = asImpl(host);
    if (h.shadow === null) {
      const shadow = SsrNodeImpl.fragment();
      shadow.parent = h;
      h.shadow = shadow;
    }
    // Recorded on the HOST and not on the fragment, because that is where it is serialized:
    // `shadowrootdelegatesfocus` rides the `<template>` the host opens (SDD-34 §4.5). Once
    // set it stays set — a second `attachShadow` on the same host is the idempotent path.
    if (delegatesFocus) h.delegatesFocus = true;
    return h.shadow;
  }

  /**
   * The host of a shadow root. The inverse link already exists — `attachShadow` above
   * leaves `shadow.parent = host` — so this adapter needs no extra field to answer it,
   * which is the check that keeps `Dom.host` free of cost on this side.
   *
   * A fragment that no `attachShadow` produced has no host, and the cast says so: the only
   * caller is the emitted `$host = $dom.host($shadow)`, whose `$shadow` came from there.
   */
  host(shadow: SsrNode): SsrNode {
    return asImpl(shadow).parent as SsrNode;
  }

  /**
   * Hookup, in SSR: nothing (SDD-15 §3.8). This is what lets the SAME `static c($props)`
   * run on both sides — the server fabricates and mounts the nodes, and the listeners
   * simply do not happen. Neither method touches the tree, so `renderToString` cannot see
   * them: hookup leaves no trace in the HTML.
   */
  event(_node: SsrNode, _type: string, _cb: (ev: Event) => void): () => void {
    return NOOP;
  }
  bus(_host: SsrNode, _name: string, _cb: (ev: Event) => void): () => void {
    return NOOP;
  }
}

/**
 * The disposer both no-ops hand back — one constant for the whole module, not a fresh
 * closure per call: a disposer nobody can tell apart from another needs no identity, and
 * `$d` may hold one per binding of every instance the page renders.
 */
const NOOP = (): void => {};

/** Unlink a node from its current parent, if any. */
function detach(n: SsrNodeImpl): void {
  const p = n.parent;
  if (p === null) {
    return;
  }
  const i = p.children.indexOf(n);
  if (i !== -1) {
    p.children.splice(i, 1);
  }
  n.parent = null;
}
