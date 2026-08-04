/**
 * The client chunks: one ES module per component, carrying its `static c($props)` factory
 * and its `customElements.define` (SDD-15 §3.7, §6.8).
 *
 * **Every component gets one, with no level filter.** A component has no level of its own:
 * one that is N1 in isolation becomes N3 the moment an ancestor hands it a reactive prop,
 * and a component's `.fud` cannot see the page it is used in. Worse, the decision is not the
 * build's to make at all — rendering happens in two places, and in both of them it happens
 * WITH DATA: the server (or the edge) at request time, and the Service Worker at navigation
 * time. What a template paints is not known until the data reaches it, so the chunk has to
 * exist before anyone can ask who hydrates. A chunk nobody requests costs nothing.
 *
 * What this does NOT do yet: publish the map from tag to chunk URL (`fud-chunks`, §3.6) or
 * the page's `data-id` (§3.1). This emits the files, names them, and stops there — the
 * linking is the next stage, and until then these chunks are here to be read and to fail
 * loudly at build time if the emit produced something a bundler cannot parse.
 */

import { resolveDocument, type ResolveIo } from '@fudic/compiler';
import { type RouteBuild } from './discover.js';
import { CLIENT_NAME_PREFIX } from './constants.js';

/** The query that turns a component id into its client chunk: `<path>.fud?client`. */
export const CLIENT_QUERY = 'client';

/** The module id of a component's client chunk. */
export const clientId = (path: string): string => `${path}?${CLIENT_QUERY}`;

/**
 * The chunk NAME, which decides the output path: `assets/h/<tag>-<hash>.js`. Its own
 * directory, because the next stage keys these by tag and a flat `assets/` would mix them
 * with the render chunks that share the same tag names.
 */
export const clientChunkName = (tag: string): string => `${CLIENT_NAME_PREFIX}/${tag}`;

/** A component that gets a client chunk. */
export interface ClientChunk {
  readonly tag: string;
  /** Absolute path to the component's `.fud`. */
  readonly path: string;
}

/**
 * Every component reachable from the built routes, deduped by tag and in a stable order.
 *
 * Reachability is the graph, not the directory: `resolveDocument` follows
 * `<link rel="component">` transitively AND through the layout chain, so a component used
 * only by a layout, or only by another component, is found. An EXCLUDED route contributes
 * nothing — it is not in the build — but a component it shares with a published one is
 * still found through that one.
 */
export function discoverComponents(
  builds: readonly RouteBuild[],
  io: ResolveIo,
): readonly ClientChunk[] {
  const byTag = new Map<string, ClientChunk>();
  for (const rb of builds) {
    if (rb.decision.mode === 'excluded') {
      continue;
    }
    for (const comp of resolveDocument(rb.absPath, io).value.components.values()) {
      if (!byTag.has(comp.tag)) {
        byTag.set(comp.tag, { tag: comp.tag, path: comp.path });
      }
    }
  }
  // Sorted, so the same project emits the same chunk list twice running: the order the
  // graph happens to be walked in is not a fact anyone should be able to observe.
  return [...byTag.values()].sort((a, b) => a.tag.localeCompare(b.tag));
}
