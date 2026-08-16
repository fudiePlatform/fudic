/**
 * The privileged view of a node, hidden behind a symbol so it is not part of the
 * public surface and cannot be reached by accident from a view.
 *
 * There is ONE interface for the two kinds of node, and that is what keeps the
 * walks in `form.ts` free of special cases: a group is a form, so the recursion
 * has a single `if` and it is about writing, not about shape.
 */

import type { AnyForm, AnyNode, Errors } from './types.js';

/** The key under which every node carries its internals. Non-enumerable. */
export const NODE = Symbol('fud.node');

/** What a validation pass carries all the way down. */
export interface ValidateCtx {
  /** The form `$validate()` was called on. What every validator receives as `root`. */
  readonly root: AnyForm;
  /** Whether the server-only validators take part. */
  readonly server: boolean;
}

/** How a value is written: completely, or only where it is mentioned. */
export type WriteMode = 'set' | 'patch';

export interface NodeInternals {
  readonly kind: 'control' | 'form';
  /** A fresh, independent node with the same declaration. `form()` clones its schema. */
  clone(): AnyNode;
  /** TRACKED read. Reading a form walks its children, so `$value()` tracks all of them. */
  read(): unknown;
  /** Total write. */
  set(v: unknown): void;
  /** Partial write. On a control it is the same write. */
  patch(v: unknown): void;
  /**
   * Throws if `v` cannot be written, BEFORE anything is written. It is what makes
   * a failed `$set` leave the form untouched instead of half assigned.
   */
  check(v: unknown, mode: WriteMode, path: string): void;
  /** Runs this node's subtree and publishes what is still current. */
  validateSubtree(ctx: ValidateCtx): Promise<void>;
  /** Publishes an error that came from outside. A control also marks itself touched. */
  publish(e: Errors | null): void;
  /** A child by name, for resolving a path. `undefined` when there is no such field. */
  child(name: string): AnyNode | undefined;
  /** Collects control errors into `out`, keyed by path. TRACKED. */
  collect(path: string, out: Record<string, Errors>): void;
  /** Untracked: no error here and none below. */
  valid(): boolean;
  touchAll(): void;
  resetAll(): void;
  clearAll(): void;
}

interface WithNode {
  readonly [NODE]: NodeInternals;
}

/** The internals of a node. Every node has them; nothing else does. */
export const internalsOf = (node: AnyNode): NodeInternals => (node as unknown as WithNode)[NODE];

/** Attaches the internals without putting them on the enumerable surface. */
export function attach<N>(node: N, internals: NodeInternals): N {
  Object.defineProperty(node, NODE, { value: internals });
  return node;
}

/** `'seo'` + `'canonical'` → `'seo.canonical'`; at the root, just the name. */
export const join = (prefix: string, name: string): string =>
  prefix === '' ? name : `${prefix}.${name}`;
