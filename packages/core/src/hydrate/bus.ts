// The components that listen to a tag's events come up before it. They are siblings outside
// its subtree, and a child may emit while its host is still mounting. One at a time, never in
// parallel, so a receiver that emits while starting finds the earlier ones alive.

import { type PageMaps } from './maps.js';
import { type Cascade } from './cascade.js';
import { type ElementRegistry } from './registry.js';
import { idOf, instancesOf, type InstanceState } from './instances.js';
import { type ReportHydrated } from './report.js';

export interface BusConfig {
  readonly maps: PageMaps;
  readonly registry: ElementRegistry;
  readonly cascade: Cascade;
  readonly state: InstanceState;
  readonly root: ParentNode;
  readonly report: ReportHydrated;
}

/** Brings up the receivers of `tag`'s events, in the order the page lists them. */
export type PreHydrateBus = (tag: string) => Promise<void>;

export function createBusPrehydrator(config: BusConfig): PreHydrateBus {
  const { maps, registry, cascade, state, root, report } = config;

  return async (tag: string): Promise<void> => {
    for (const receiver of maps.bus[tag] ?? []) {
      if (registry.get(receiver) !== undefined) continue;
      const ms = await cascade.raise(receiver);
      for (const host of instancesOf(receiver, root)) {
        const id = idOf(host);
        if (state.hydrated.has(id)) continue;
        state.hydrated.add(id);
        report(id, receiver, ms, 'bus');
      }
    }
  };
}
