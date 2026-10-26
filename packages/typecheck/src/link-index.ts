/**
 * The narrow port the shared machine asks the workspace through (SDD-35 §3.1).
 *
 * The editor's `WorkspaceIndex` knows far more — roles, contracts, snippets, how to write a
 * link — and the build has no editor at all. What the projection and the rules actually ask is
 * one question: what an `href` written in a file points at, and for that target its tag and,
 * for a layout, its holes. Both indexes answer it; neither is named here.
 */

import type { LayoutHoles, ProjectModule } from '@fudic/compiler';
import type { ServerImport } from '@fudic/language-core';
import type { LookupFailure } from '@fudic/resolve';

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
  /** Why a package specifier written inside `fromFile` resolves to nothing, when it is one. */
  failure(fromFile: string, href: string): LookupFailure | undefined;
  /**
   * The `.fudapi` an `href` of a `<link rel="server">` names, read (SDD-60 §4.7); `undefined`
   * when there is none. Optional: an index that cannot read them gives a file nothing.
   */
  server?(fromFile: string, href: string): ServerImport | undefined;
  /**
   * A module of the project that `fromFile` imports as `specifier` (SDD-61 §4.1): what lets the
   * server cut follow a store. `undefined` when it is not one, or cannot be read. Optional: an
   * index that cannot read modules leaves the project's imports unchecked.
   */
  module?(fromFile: string, specifier: string): ProjectModule | undefined;
}
