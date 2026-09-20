/**
 * Entry of the `core/warm-sw` piece (SDD-45 §4.3.1): the warm channel of a page the render
 * Service Worker controls.
 *
 * It is a piece of its own, and not four hundred bytes folded into the coordinator, because
 * the coordinator is the one artefact the APPLICATION's build generates: putting framework
 * code in there would be compiling the runtime per app again, which is what this SDD came to
 * remove. Two small exclusive pieces, and the coordinator names one of them.
 */

import {
  createServiceWorkerWarmChannel,
  type ServiceWorkerChannelConfig,
} from '../src/hydrate/warm/sw.js';
import type { RuntimeEntry } from '../src/runtime-entry.js';

/** The uniform startup name (§3.4). See `bundle/hydrate.ts` for why it is an alias. */
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
