// Entry of the `core/warm-preload` runtime piece, for pages no Service Worker controls.

import {
  createPreloadWarmChannel,
  type PreloadChannelConfig,
} from '../src/hydrate/warm/preload.js';
import type { RuntimeEntry } from '../src/runtime-entry.js';

export const install: RuntimeEntry<PreloadChannelConfig>['install'] = createPreloadWarmChannel;

export {
  createPreloadWarmChannel,
  type PreloadChannelConfig,
} from '../src/hydrate/warm/preload.js';

// Shared with `warm-sw` and copied into both: a page only ever loads one of them.
export {
  nullWarmChannel,
  WARMED_EVENT,
  type WarmChannel,
  type WarmedDetail,
} from '../src/hydrate/warm/channel.js';
