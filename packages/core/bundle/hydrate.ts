// Entry of the published `core/hydrate` runtime piece. Kept out of `src` so `dist` does not
// get a second name for the same code and coverage does not count a re-export.

import { installHydration, type HydrationOptions } from '../src/hydrate/install.js';
import type { RuntimeEntry } from '../src/runtime-entry.js';

// The name the page coordinator imports; typed so a drift fails the typecheck.
export const install: RuntimeEntry<HydrationOptions>['install'] = installHydration;

// `isCellMark` and the block ids are not exported: no browser imports them, and naming them
// would stop the minifier from shortening them in the piece every hydrating page loads.
export {
  installHydration,
  READY_EVENT,
  HYDRATED_EVENT,
  type Hydration,
  type HydrationOptions,
  type HydratedDetail,
} from '../src/hydrate/install.js';
