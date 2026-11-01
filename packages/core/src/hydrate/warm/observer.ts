// Decides which chunks to download ahead of a gesture, and when. A tag is warmed once, when
// its first instance comes into view, together with everything bringing it up will need:
// the components that listen to it and its subtree. Nothing here evaluates a chunk.

import { type ResolveChunk } from '../chunks.js';
import { type PageMaps } from '../maps.js';
import { allInstances, ROUTE_HOST } from '../instances.js';
import { type WarmChannel } from './channel.js';

/** Calls `onVisible` the first time each target comes into view. */
export type ObserveVisible = (
  targets: readonly Element[],
  onVisible: (target: Element) => void,
) => void;

/** Runs a background task when the main thread is idle. */
export type Schedule = (task: () => void) => void;

const IDLE_TIMEOUT = 800;
const FALLBACK_DELAY = 200;

export const viewportObserver: ObserveVisible = (targets, onVisible) => {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
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

// Bounded, so a page that is never idle still warms.
export const idleSchedule: Schedule = (task) => {
  if ('requestIdleCallback' in globalThis) {
    requestIdleCallback(task, { timeout: IDLE_TIMEOUT });
    return;
  }
  setTimeout(task, FALLBACK_DELAY);
};

export interface WarmObserverConfig {
  readonly maps: PageMaps;
  readonly resolveChunk: ResolveChunk;
  readonly channel: WarmChannel;
  readonly root: ParentNode;
  readonly observe?: ObserveVisible;
  readonly schedule?: Schedule;
}

export function startWarmObserver(config: WarmObserverConfig): void {
  const { maps, resolveChunk, channel, root } = config;
  const observe = config.observe ?? viewportObserver;
  const schedule = config.schedule ?? idleSchedule;
  const warmedTags = new Set<string>();

  const closure = (tag: string, out: string[]): void => {
    if (warmedTags.has(tag)) return;
    warmedTags.add(tag);
    out.push(tag);
    for (const next of [...(maps.bus[tag] ?? []), ...(maps.tree[tag] ?? [])]) {
      closure(next, out);
    }
  };

  // The route's `<body>` is always in view: watching it would download the route's chunk on
  // load, with no gesture behind it.
  const watched = allInstances(root).filter((el) => el.localName !== ROUTE_HOST);
  observe(watched, (target) => {
    const tags: string[] = [];
    closure(target.localName, tags);
    if (tags.length === 0) return;
    schedule(() => {
      channel.warm(tags.map(resolveChunk), tags);
    });
  });
}
