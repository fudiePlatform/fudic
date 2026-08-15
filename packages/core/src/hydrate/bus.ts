/**
 * Step 3 of path 2: the receivers of the bus, raised BEFORE the emitter (SDD-17 §4.4).
 *
 * **Bus first, and this SDD is what fixes it** — bus and cascade were validated in separate
 * prototypes that never ran together. The receivers of the bus are SIBLING components,
 * external to the host; the subtree is INTERNAL to it. If the subtree mounted first, a child
 * emitting from its own hookup — perfectly legal — would emit with the receivers still dead,
 * which is exactly the failure directed hydration exists to prevent.
 *
 * **In sequence, never `Promise.all`.** The order receiver→emitter has to hold even if a
 * receiver emitted something while starting up; concurrency would make that a race.
 *
 * A receiver composes too, so raising it is the same three steps the host gets: its subtree
 * by `prepareTag`, then its definition, then the handout of the payload. The SDD's
 * pseudocode for step 3 says `ensureDefined` alone; defining the tag upgrades its instances,
 * so the invariant of §4.4 applies to it verbatim.
 *
 * **The runtime knows no event names.** The compiler already resolved `picked` into a
 * tag→tags relation (SDD-15 §3.5): what is consumed here is "to raise A, raise B first".
 * And only ONE replay happens, the original gesture's — the bus event is not replayed, it is
 * born naturally from the user's handler when it runs, and the receiver, already alive,
 * takes it in its own propagation.
 */

import { type PageMaps } from './maps.js';
import { type ChunkLoader } from './chunks.js';
import { type Cascade } from './cascade.js';
import {
  idOf,
  instancesOf,
  stopwatch,
  type ElementRegistry,
  type InstanceState,
  type ReportHydrated,
} from './registry.js';

export interface BusConfig {
  readonly maps: PageMaps;
  readonly loader: ChunkLoader;
  readonly registry: ElementRegistry;
  readonly cascade: Cascade;
  readonly state: InstanceState;
  readonly root: ParentNode;
  readonly report: ReportHydrated;
}

/** Raise every receiver `tag` emits to, in order, before anything else happens. */
export type PreHydrateBus = (tag: string) => Promise<void>;

export function createBusPrehydrator(config: BusConfig): PreHydrateBus {
  const { maps, loader, registry, cascade, state, root, report } = config;

  return async (tag: string): Promise<void> => {
    for (const receiver of maps.bus[tag] ?? []) {
      if (registry.get(receiver) !== undefined) {
        continue; // already alive: nothing to raise, and the order is already satisfied
      }
      const elapsed = stopwatch();
      await cascade.prepareTag(receiver);
      await loader.ensureDefined(receiver);
      cascade.attachAll(receiver);
      for (const host of instancesOf(receiver, root)) {
        const id = idOf(host);
        if (state.hydrated.has(id)) {
          continue;
        }
        state.hydrated.add(id);
        report(id, receiver, elapsed(), 'bus');
      }
    }
  };
}
