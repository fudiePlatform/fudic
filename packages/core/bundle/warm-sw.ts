// Entry of the `core/warm-sw` runtime piece, for pages a Service Worker controls.

import {
  createServiceWorkerWarmChannel,
  type ServiceWorkerChannelConfig,
} from '../src/hydrate/warm/sw.js';
import type { RuntimeEntry } from '../src/runtime-entry.js';

export const install: RuntimeEntry<ServiceWorkerChannelConfig>['install'] =
  createServiceWorkerWarmChannel;

export {
  createServiceWorkerWarmChannel,
  WARM_MESSAGE,
  WARMED_MESSAGE,
  type ServiceWorkerChannelConfig,
  type ServiceWorkerHost,
  type WarmMessage,
  type WarmedMessage,
} from '../src/hydrate/warm/sw.js';

// Shared with `warm-preload` and copied into both: a page only ever loads one of them.
export {
  nullWarmChannel,
  WARMED_EVENT,
  type WarmChannel,
  type WarmedDetail,
} from '../src/hydrate/warm/channel.js';
