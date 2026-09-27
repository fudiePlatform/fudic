/**
 * The privileged view of a node, hidden behind a symbol so it is not part of the
 * public surface and cannot be reached by accident from a view.
 *
 * There is ONE interface for the two kinds of node, and that is what keeps the
 * walks in `form.ts` free of special cases: a group is a form, so the recursion
 * has a single `if` and it is about writing, not about shape.
 */

import type { AnyForm, AnyNode, Errors, Issue } from './types.js';
import type { ValidateOn } from './validate-on.js';
import type { Validity } from './validity.js';

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
  /**
   * Runs this node's subtree and publishes what is still current.
   *
   * What can be decided synchronously is PUBLISHED synchronously, and the promise is only
   * there when some rule answered later — `undefined` means the whole subtree is already on
   * record. That is what a submit decides on (BUG-41 §4.2).
   */
  validateSubtree(ctx: ValidateCtx): Promise<void> | undefined;
  /**
   * Tells this node which form is its root: what its rules receive as `root` when it is
   * validated on its own. Called by `form()` on every clone, and again — overriding — by the
   * form a group is nested in, so the root is always the OUTERMOST form.
   *
   * `validateOn` travels with it, the other way round: each form passes down its OWN policy
   * when it has one and the inherited one when not, so the NEAREST form that chose wins.
   * `undefined` when none did. `validity` travels the same way (BUG-42 §4.3).
   *
   * `above` re-runs the own rules of every form and group above this node, nearest first. A
   * control calls it each time it validates on its own, so a summary speaks at the same moments
   * as the fields under it — «the passwords do not match» appears while typing, not only on a
   * submit (BUG-42 §0.6, §4.7).
   */
  adopt(
    root: AnyForm,
    validateOn: ValidateOn | undefined,
    validity: Validity | undefined,
    above: () => void,
  ): void;
  /** Publishes an error that came from outside. A control also marks itself touched. */
  publish(e: Errors | null): void;
  /** A child by name, for resolving a path. `undefined` when there is no such field. */
  child(name: string): AnyNode | undefined;
  /** Collects control errors into `out`, keyed by path. TRACKED. */
  collect(path: string, out: Record<string, Errors>): void;
  /** Untracked: no error ON RECORD here and none below. What `$validate` resolves to. */
  clean(): boolean;
  /** TRACKED and silent: the current values obey the rules that count (BUG-42 §4.3). */
  valid(): boolean;
  /** TRACKED: some control here or below counts for the validity. */
  counts(): boolean;
  /**
   * Moves whenever a value here or below moves. A control's epoch; a form's is the sum of its
   * children's, which only grows and changes exactly when one of them does.
   */
  epoch(): number;
  /** Appends the visible errors of this node and, after a submit, of those below (BUG-42 §4.7). */
  issues(path: string, out: Issue[]): void;
  /** Records a submit attempt here and below. What `bindForm` calls; there is no public writer. */
  markSubmitted(): void;
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
