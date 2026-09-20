/**
 * Entry of the `di/page` piece (SDD-45 §4.3.1): the container tree of a route, built from the
 * emitted map before a single component chunk is fetched.
 *
 * It lives beside `src` and not inside it because it is an ARTEFACT of the build, not a module
 * of the package: `dist` must not grow a second copy of `buildTree` under a second name, and
 * `src/**` is the denominator of this package's coverage — a re-export nobody imports from a
 * test would be a hole in a number that exists to be honest.
 */

import type { RuntimeEntry } from '@fudic/core';

import { buildTree, type IocNodes } from '../src/page.js';
import type { Container } from '../src/types.js';

/**
 * What the coordinator hands this piece: the emitted map, the route's IoC module, and the
 * seed the server published.
 *
 * The three arguments of `buildTree` arrive as one object because §3.4 gives every startup
 * piece the same shape — `install(options)` — and the shape is what lets the generator write
 * the call without knowing which piece it is writing. `buildTree` keeps its own signature
 * below, for the callers that already have it.
 */
export interface PageTreeOptions {
  /** `nodes[i]` is the parent index of node `i`; node 0 is the root, whose parent is `-1`. */
  readonly nodes: IocNodes;
  /** The route's IoC module: it puts each node's factories into the container it owns them in. */
  readonly register: (node: number, container: Container) => void;
  /** What the server published for the root container, when the route published anything. */
  readonly seed?: Readonly<Record<string, unknown>>;
}

/**
 * The uniform startup name (§3.4), and the annotation is the contract being checked rather
 * than described: a drift away from the shape the coordinator imports fails `pnpm typecheck`
 * instead of failing in a browser, inside a module the user did not write.
 */
export const install: RuntimeEntry<PageTreeOptions>['install'] = ({ nodes, register, seed }) =>
  buildTree(nodes, register, seed);

export { buildTree, containerOf, type IocNodes } from '../src/page.js';
