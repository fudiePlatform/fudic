/**
 * The narrow port the shared machine asks the workspace through (SDD-35 §3.1).
 *
 * The editor's `WorkspaceIndex` knows far more — roles, contracts, snippets, how to write a
 * link — and the build has no editor at all. What the projection and the rules actually ask is
 * one question: what an `href` written in a file points at, and for that target its tag and,
 * for a layout, its holes. Both indexes answer it; neither is named here.
 */

import type { LayoutHoles } from '@fudic/compiler';

/** What a resolved `href` points at, as far as the check cares. */
export interface LinkTarget {
  /** The tag it defines, `''` for anything that is not a component. */
  readonly tag: string;
  /** A layout's holes; no hole at all for anything else. */
  readonly holes: LayoutHoles;
}

/** Where the `<link>`s of a file resolve. */
export interface LinkIndex {
  /** What an `href` written inside `fromFile` points at, if it is a known `.fud`. */
  resolve(fromFile: string, href: string): LinkTarget | undefined;
}
