/**
 * Entry of the `di/page` piece (SDD-45 §4.3.1): the container tree of a route, built from the
 * emitted map before a single component chunk is fetched.
 *
 * It lives beside `src` and not inside it because it is an ARTEFACT of the build, not a module
 * of the package: `dist` must not grow a second copy of the work under a second name, and
 * `src/**` is the denominator of this package's coverage. What is here is the uniform name of
 * §3.4 and nothing else — the work itself is `installPage`, in `src`, because dev imports it
 * from the package and a coordinator with one shape in dev and another in a build would be
 * two programs (§4.15).
 */

import type { RuntimeEntry } from '@fudic/core';

import { installPage, type PageTreeOptions } from '../src/page.js';

/**
 * The uniform startup name (§3.4), and the annotation is the contract being checked rather
 * than described: a drift away from the shape the coordinator imports fails `pnpm typecheck`
 * instead of failing in a browser, inside a module the user did not write.
 */
export const install: RuntimeEntry<PageTreeOptions>['install'] = installPage;

export {
  buildTree,
  containerOf,
  installPage,
  type IocMap,
  type IocNodes,
  type PageTreeOptions,
} from '../src/page.js';
