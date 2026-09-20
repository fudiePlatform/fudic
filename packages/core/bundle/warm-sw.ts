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

/**
 * What the two channels share, published from inside each of them rather than from a piece of
 * its own (§4.3, second rule, and its one written exception).
 *
 * The rule says a module two pieces reach becomes a piece, so that its bytes are not twice on
 * the origin. Here they cannot be: an application has a Service Worker or it does not, so no
 * browser ever holds both channels, and the saving the rule protects can never be collected.
 * What it did cost was real — 184 bytes paying a 150-byte frontier and a request.
 */
export {
  nullWarmChannel,
  WARMED_EVENT,
  type WarmChannel,
  type WarmedDetail,
} from '../src/hydrate/warm/channel.js';
