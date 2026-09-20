/**
 * Entry of the `core/hydrate` piece (SDD-45 §4.3.1): the hydration runtime, bundled.
 *
 * It lives beside `src` and not inside it because it is an ARTEFACT of the build, not a
 * module of the package: `dist` must not grow a second copy of the capturer under a second
 * name, and `src/**` is the denominator of this package's coverage — a re-export nobody
 * imports from a test would be a hole in a number that exists to be honest.
 */

import { installHydration, type HydrationOptions } from '../src/hydrate/install.js';
import type { RuntimeEntry } from '../src/runtime-entry.js';

/**
 * The uniform startup name (§3.4), and the annotation is the contract being checked rather
 * than described: a drift away from the shape the coordinator imports fails `pnpm typecheck`
 * instead of failing in a browser, inside a module the user did not write.
 *
 * `installHydration` is re-exported unchanged below. Today's callers — the generated
 * bootstrap of SDD-19, the tests, anybody holding `@fudic/core` — keep the name they know;
 * `install` is the name the coordinator imports, and it is an alias, not a second entry.
 */
export const install: RuntimeEntry<HydrationOptions>['install'] = installHydration;

export {
  installHydration,
  READY_EVENT,
  HYDRATED_EVENT,
  type Hydration,
  type HydrationOptions,
  type HydratedDetail,
} from '../src/hydrate/install.js';
