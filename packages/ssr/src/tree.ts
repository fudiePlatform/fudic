/**
 * The detached SSR node tree (SDD-14 §4.3). `SsrDom` builds a tree, NOT an
 * incremental string: the same construction logic the emit writes runs
 * unchanged on both `browserDom` and `SsrDom`, and ordering is decided by the
 * final serialization, not by call order — so `before` works in SSR too.
 *
 * `SsrNode` is an opaque handle: consumers get nodes back from `SsrDom` and pass
 * them around, but the shape is internal to this package.
 */

import { type Ns } from '@fudic/dom';

export type SsrKind = 'element' | 'text' | 'comment' | 'fragment';

/** Opaque handle to a node in the SSR tree. Built only by `SsrDom`. */
export interface SsrNode {
  readonly kind: SsrKind;
}

/** Internal node. Mutable; owned by `SsrDom`. */
export class SsrNodeImpl implements SsrNode {
  parent: SsrNodeImpl | null = null;
  readonly children: SsrNodeImpl[] = [];
  /** Ordered attribute map (insertion order preserved; a re-set overwrites in place). */
  readonly attrs = new Map<string, string>();
  /** The shadow root (a fragment), if `attachShadow` was called on this element. */
  shadow: SsrNodeImpl | null = null;

  constructor(
    readonly kind: SsrKind,
    readonly tag: string | null,
    readonly ns: Ns,
    public data: string,
  ) {}

  static element(tag: string, ns: Ns): SsrNodeImpl {
    return new SsrNodeImpl('element', tag, ns, '');
  }
  static leaf(kind: 'text' | 'comment', data: string): SsrNodeImpl {
    return new SsrNodeImpl(kind, null, 'html', data);
  }
  static fragment(): SsrNodeImpl {
    return new SsrNodeImpl('fragment', null, 'html', '');
  }
}

/** Narrow a public handle back to the internal node. Safe: only `SsrDom` mints them. */
export function asImpl(node: SsrNode): SsrNodeImpl {
  return node as SsrNodeImpl;
}
