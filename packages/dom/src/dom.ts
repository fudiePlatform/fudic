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
}
