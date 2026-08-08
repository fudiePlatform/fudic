/**
 * The isomorphic node contract (SDD-14 §3.1). Segregated into two interfaces so
 * that neither adapter is ever forced to implement a method it cannot honor
 * (ISP/LSP): `Dom<N>` is the construction surface both adapters implement in
 * full; `DomClient<N>` adds the browser-only surface (reactive mutation and
 * hydration traversal). The SSR adapter implements ONLY `Dom<N>` — it has no
 * throwing stubs, because what it cannot do is simply absent from its contract.
 *
 * A fina indirection over the DOM primitives: it masks the primitives, NOT the
 * policy. No VDOM, no diffing.
 *
 * **`event` and `bus` are methods of the adapter, and that is a deliberate
 * deviation** from the refunded `SDD-eventos-captura-contexto`, where `event`
 * was a free function imported from `@fudic/core/dom`. The semantics are
 * identical (subscribe, do not reorder, return the unsubscription with the same
 * reference); what changes is that a free import would tie the EMITTED code to
 * the browser and force a second emit for SSR. As methods they sit in `Dom<N>`,
 * so one controller runs against both adapters: the server fabricates and
 * mounts, and the hookup simply does nothing.
 */

import { type Ns } from './ns.js';

/**
 * Construction contract — generic in `N` (the node type). Everything `create()`
 * needs, and nothing else. Both `browserDom` (N = Node, live DOM) and `SsrDom`
 * (N = SsrNode, detached tree → string) implement it completely.
 */
export interface Dom<N> {
  element(tag: string, ns?: Ns): N;
  text(data: string): N;
  comment(data: string): N;
  setAttr(el: N, name: string, value: string): void;
  removeAttr(el: N, name: string): void;
  append(parent: N, child: N): void;
  /** `anchor.before(node)`: in the browser fires `connectedCallback`; in SSR it fixes tree order. */
  before(anchor: N, node: N): void;
  remove(node: N): void;
  /** Browser: `host.attachShadow({mode:'open'})`. SSR: opens `<template shadowrootmode="open">`. */
  attachShadow(host: N): N;
  /**
   * The host a shadow root hangs from — the inverse of `attachShadow`.
   *
   * It belongs to `Dom<N>` and not to `DomClient<N>` because the factory that calls it is
   * the same one that runs against the SERVER adapter (SDD-15 §6.14): a call that only
   * existed on the client would break that execution. Nothing had to be added to carry it,
   * either — the shadow already knows its host on both sides (`shadow.host` in the browser,
   * the parent link `attachShadow` leaves in the SSR tree), which is why the compiler reads
   * it from here instead of taking one more position in `$props`.
   */
  host(shadow: N): N;

  /**
   * Subscribe `cb` to `type` on `node`. Returns the unsubscription (SDD-15 §3.8).
   *
   * It neither wraps `cb` nor reorders its arguments: the unsubscription is handed the
   * IDENTICAL reference, because any wrapper would add the very frame the emitted binding
   * exists not to pay (§4.5).
   */
  event(node: N, type: string, cb: (ev: Event) => void): () => void;

  /**
   * Subscribe `cb` to a bus channel (§4.4). Returns the unsubscription.
   *
   * The listener goes on the DOCUMENT, never on `host` — emitter and subscriber are
   * SIBLINGS, so a `CustomEvent` bubbling out of the emitter climbs ITS ancestors and never
   * enters the subscriber. `host` is what says WHICH document, and the handler's context is
   * the caller's business: the emitted binding calls it with the host itself.
   */
  bus(host: N, name: string, cb: (ev: Event) => void): () => void;
}

/**
 * Client contract — extends construction with what only exists in the browser:
 * fine-grained reactive mutation (`setText`/`setProp`) and traversal for
 * hydration. `SsrDom` does NOT implement it: the impossibility of hydrating in
 * SSR is a property of the type, not a runtime throw.
 */
export interface DomClient<N> extends Dom<N> {
  /** Retouch the data of an existing text/comment node (the fine-grained `update()`). */
  setText(node: N, data: string): void;
  /** JS property (not an attribute): parent→child props, `.value`, signals. */
  setProp(el: N, name: string, value: unknown): void;
  firstChild(node: N): N | null;
  nextSibling(node: N): N | null;
  previousSibling(node: N): N | null;
  childAt(node: N, index: number): N | null;
  /**
   * Element-only traversal — how hydration actually walks a level.
   *
   * A tree that goes through HTML and back does not preserve text-node boundaries:
   * two adjacent text nodes serialize to one run of characters and the parser hands
   * back ONE node. Elements have no such ambiguity, so an element cursor is the only
   * position that survives the round trip. Text is reached from the element beside
   * it, not by counting.
   */
  firstElementChild(node: N): N | null;
  nextElementSibling(node: N): N | null;
  /**
   * The other end of a level, for the text that no element follows: with the element
   * cursor spent, an interpolated run is the parent's last node — everything after it
   * is text, and text adjacent to text is the same node.
   */
  lastChild(node: N): N | null;
}
