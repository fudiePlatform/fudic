/**
 * The global capturer, assembled (SDD-17 §4.4): the ONE module a fudic page downloads on
 * the initial load, and the only place the order of path 2 is written down.
 *
 *     3. preHydrateBus(tag)   — the bus receivers, IN SEQUENCE
 *     4. prepareTag(tag)      — the subtree of EVERY instance of the tag, in post-order
 *     5. ensureDefined + attachAll — the host, LAST
 *     6. replay               — the original gesture, once
 *
 * The order 3 → 4 → 5 is this SDD's, and no previous document stated it: bus and cascade
 * were prototyped apart. Bus first because its receivers are siblings EXTERNAL to the host
 * while the subtree is INTERNAL to it, and a child emitting during its own hookup must not
 * find the receivers dead. When the user's handler finally runs, in the replay, everything
 * it presupposes alive is alive.
 *
 * Everything else in this file is the two lifecycle events the page publishes for
 * instrumentation, and nothing depends on anyone listening to them.
 */

import { readPageMaps } from './maps.js';
import {
  createChunkLoader,
  importChunk,
  type ImportModule,
  type ResolveChunk,
} from './chunks.js';
import { createCascade } from './cascade.js';
import { createBusPrehydrator } from './bus.js';
import { createCapturer } from './capture.js';
import {
  browserRegistry,
  instanceState,
  stopwatch,
  type ElementRegistry,
  type HydratedFrom,
  type ReportHydrated,
} from './registry.js';
import { type WarmChannel } from './warm/channel.js';

/** Runtime installed, and not one line of component JavaScript evaluated yet. */
export const READY_EVENT = 'fud:ready';
/** One instance is live. `detail: { id, tag, ms, from }` (SDD-17 §3). */
export const HYDRATED_EVENT = 'fud:hydrated';

export interface HydratedDetail {
  readonly id: number;
  readonly tag: string;
  readonly ms: string;
  readonly from: HydratedFrom;
}

/**
 * The event types the capturer listens to.
 *
 * Only types that BUBBLE can be delegated from a global capturer, and the validated scope is
 * `click` (§4.2, §8). `focus`, `scroll` and `mouseenter` are outside it by nature, not by
 * omission: they never reach the root.
 */
const CAPTURED_TYPES: readonly string[] = ['click'];

export interface HydrationOptions {
  /** Where the single capture listener goes — the root of the application area (§4.2). */
  readonly root: EventTarget;
  /** The URL of a tag's hydration chunk (§4.6). Injected: the bootstrap knows the mode. */
  readonly resolveChunk: ResolveChunk;
  /**
   * The anticipated-network port (§4.7). Injected by the bootstrap alongside `resolveChunk`
   * because the two answers depend on the same fact — how the page was emitted — and its
   * trigger is the viewport observer, which is a separate axis from hydration.
   */
  readonly warm?: WarmChannel;
  /** The document that publishes the maps and receives the lifecycle events. */
  readonly document?: Document;
  /** How a chunk is fetched. Injected so the runtime is testable off-network. */
  readonly importModule?: ImportModule;
  /** The custom-element registry. Injected for the same reason (§4.4). */
  readonly registry?: ElementRegistry;
}

export function installHydration(options: HydrationOptions): void {
  const doc = options.document ?? document;
  const registry = options.registry ?? browserRegistry;
  const maps = readPageMaps(doc);
  const state = instanceState();
  const loader = createChunkLoader({
    resolveChunk: options.resolveChunk,
    registry,
    importModule: options.importModule ?? importChunk,
  });

  const report: ReportHydrated = (id, tag, ms, from) => {
    const detail: HydratedDetail = { id, tag, ms, from };
    doc.dispatchEvent(new CustomEvent(HYDRATED_EVENT, { detail }));
  };

  const cascade = createCascade({ maps, loader, registry, state, root: doc, report });
  const preHydrateBus = createBusPrehydrator({
    maps,
    loader,
    registry,
    cascade,
    state,
    root: doc,
    report,
  });

  /** Path 2, in the one order §4.4 fixes. */
  const raise = async (host: Element, id: number, replay: () => void): Promise<void> => {
    const tag = host.localName;
    await preHydrateBus(tag); // 3 — the receivers, before anything internal
    await cascade.prepareTag(tag); // 4 — the subtree of every instance, post-order
    const elapsed = stopwatch();
    await loader.ensureDefined(tag); // 5 — the host, last
    cascade.attachAll(tag);
    report(id, tag, elapsed(), 'downloaded');
    replay(); // 6 — one replay, and only on this path
  };

  const capture = createCapturer({
    state,
    registry,
    onCold: (host, id, replay) => {
      void raise(host, id, replay);
    },
    onShared: (host, id) => {
      // Nothing was downloaded and nothing waited: the instance was ready before the click.
      report(id, host.localName, '0.0', 'shared-chunk');
    },
  });

  for (const type of CAPTURED_TYPES) {
    options.root.addEventListener(type, capture, true);
  }
  doc.dispatchEvent(new CustomEvent(READY_EVENT));
}
