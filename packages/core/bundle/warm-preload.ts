/**
 * Entry of the `core/warm-preload` piece (SDD-45 §4.3.1): the warm channel of a page with no
 * Service Worker — a `<link rel="modulepreload">` per chunk.
 *
 * The exclusive twin of `warm-sw`. Which of the two a route names is a fact of the
 * application, and the coordinator holds that fact; neither piece knows the other exists.
 */

import {
  createPreloadWarmChannel,
  type PreloadChannelConfig,
} from '../src/hydrate/warm/preload.js';
import type { RuntimeEntry } from '../src/runtime-entry.js';

/** The uniform startup name (§3.4). See `bundle/hydrate.ts` for why it is an alias. */
export const install: RuntimeEntry<PreloadChannelConfig>['install'] = createPreloadWarmChannel;

export {
  createPreloadWarmChannel,
  type PreloadChannelConfig,
} from '../src/hydrate/warm/preload.js';

/** The exclusive twin's half of the same exception — see `bundle/warm-sw.ts`. */
export {
  nullWarmChannel,
  WARMED_EVENT,
  type WarmChannel,
  type WarmedDetail,
} from '../src/hydrate/warm/channel.js';
