/**
 * The warm trigger (SDD-17 §4.7): WHICH chunks are worth anticipating, and WHEN.
 *
 * It is the same trigger for both channels — the Service Worker one and the
 * `modulepreload` one — because what changes between a page with a worker and one without
 * is the transport, never the policy. So this module decides and the channel carries.
 *
 * Three rules, and each one is what separates `viewport` from a blanket preload:
 *
 *  - **A tag is warmed when the FIRST of its instances enters the viewport**, and never
 *    again: `warmedTags` is idempotent by tag, so N instances of one tag cost one order.
 *    A tag whose instances stay below the fold costs no network at all until the user
 *    scrolls near it — the network is spent in proportion to what is seen.
 *  - **The transitive closure, not the bare tag.** Interacting with a tag makes the runtime
 *    need exactly its bus receivers and its subtree (§4.4), so warming only the host would
 *    leave the cascade paying network inside the gesture. None of the four refunded
 *    prototypes did this: warm was prototyped without bus and without cascade.
 *  - **Ordered in idle.** Warm is background work and must not steal main-thread time while
 *    there is render or interaction pending; the timeout bounds the wait so a page that
 *    never goes idle still warms.
 *
 * Nothing here evaluates a chunk. The founding invariant — zero component JavaScript until
 * the interaction — is untouched: this schedules a deposit, and hydration is correct whether
 * or not the deposit ever happens.
 */

import { type ResolveChunk } from '../chunks.js';
import { type PageMaps } from '../maps.js';
import { allInstances } from '../registry.js';
import { type WarmChannel } from './channel.js';

/** Port: watch these hosts and call back the first time each one becomes visible. */
export type ObserveVisible = (
  targets: readonly Element[],
  onVisible: (target: Element) => void,
) => void;

/** Port: run this background task when the main thread has nothing better to do. */
export type Schedule = (task: () => void) => void;

/** Without a hole of idle time in this long, the warm is ordered anyway. */
const IDLE_TIMEOUT = 800;
/** The wait of the fallback, for engines with no `requestIdleCallback`. */
const FALLBACK_DELAY = 200;

/** The platform trigger: a single observer, each host observed exactly once. */
export const viewportObserver: ObserveVisible = (targets, onVisible) => {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          // Unobserved BEFORE the callback: the host is done with, and an instance that
          // leaves and re-enters the viewport must not re-order anything.
          observer.unobserve(entry.target);
          onVisible(entry.target);
        }
      }
    },
    { rootMargin: '0px', threshold: 0 },
  );
  for (const target of targets) {
    observer.observe(target);
  }
};

/** The platform scheduler: idle with a bound, and a plain timeout where idle is absent. */
export const idleSchedule: Schedule = (task) => {
  if ('requestIdleCallback' in globalThis) {
    requestIdleCallback(task, { timeout: IDLE_TIMEOUT });
    return;
  }
  setTimeout(task, FALLBACK_DELAY);
};

export interface WarmObserverConfig {
  /** `fud-tree` and `fud-bus`: what a tag drags along with it (§4.4). */
  readonly maps: PageMaps;
  /** The same port hydration resolves chunks with — one derivation, one answer (§4.6). */
  readonly resolveChunk: ResolveChunk;
  /** Where the order is carried: a worker, a `<link>`, or nowhere. */
  readonly channel: WarmChannel;
  /** The tree the hydratable instances are looked for in. */
  readonly root: ParentNode;
  readonly observe?: ObserveVisible;
  readonly schedule?: Schedule;
}

export function startWarmObserver(config: WarmObserverConfig): void {
  const { maps, resolveChunk, channel, root } = config;
  const observe = config.observe ?? viewportObserver;
  const schedule = config.schedule ?? idleSchedule;
  /** The client half of the two-layer idempotence of §4.7; the worker holds the other. */
  const warmedTags = new Set<string>();

  /** `tag` plus its bus receivers plus its subtree, recursively — minus what is done. */
  const closure = (tag: string, out: string[]): void => {
    if (warmedTags.has(tag)) {
      return;
    }
    warmedTags.add(tag);
    out.push(tag);
    for (const next of [...(maps.bus[tag] ?? []), ...(maps.tree[tag] ?? [])]) {
      closure(next, out);
    }
  };

  observe(allInstances(root), (target) => {
    const tags: string[] = [];
    closure(target.localName, tags);
    if (tags.length === 0) {
      return; // a sibling instance of a tag already ordered: nothing left to warm
    }
    schedule(() => {
      channel.warm(tags.map(resolveChunk), tags);
    });
  });
}
