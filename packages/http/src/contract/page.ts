/**
 * `load`, `paths` and `layout` of a route's `.fudapi` (SDD-60 §3.4): pieces only the server
 * implements, `load.handle(fn)` and its siblings, never called from the browser.
 */

import { Slot } from '@fudic/forms/contract';
import type { ServerContext } from '../types.js';
import type { Level } from './middleware.js';

export interface PageSpec {
  readonly id: string;
  /** `load`, `paths` or `layout`. */
  readonly name: string;
  /** `load`: global, file and its own level. */
  readonly chain?: readonly Level[];
  /** The browser variant: no implementation is possible here. */
  readonly browser?: boolean;
}

/** The `ctx` of `load` and `layout`: the page's params, typed. */
export type PageContext<P> = Omit<ServerContext<undefined>, 'params'> & { readonly params: P };

export interface PagePiece<F> {
  readonly spec: PageSpec;
  readonly slot: Slot<F>;
  /** Registers the implementation. Returns nothing. */
  handle(fn: F): void;
}

export function page<F>(spec: PageSpec): PagePiece<F> {
  const slot = new Slot<F>(`${spec.name} of ${spec.id}`, 'server', spec.browser === true);
  return { spec, slot, handle: (fn) => slot.set(fn) };
}
