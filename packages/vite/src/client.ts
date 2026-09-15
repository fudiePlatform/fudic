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
 * There is no map from tag to chunk URL, and there is not going to be one: the URL of a
 * tag's hydration chunk is derivable from the manifest alone through
 * `createUrlResolver(base, build).hydrateUrl(tag)` (SDD-27 §4.1). What the page does publish
 * is the `data-fud-id` of each hydratable instance and the three JSON blocks (SDD-15 §3.1,
 * §3.3–§3.5), which the render writes; this module only emits the files and names them.
 */

import {
  hasDependencyInjection,
  iocName,
  isReactiveRoute,
  ownsContainer,
  resolveDocument,
  usesDependencyInjection,
  type ResolveIo,
} from '@fudic/compiler';
import { safeName } from '@fudic/transport';
import { type RouteBuild } from './discover.js';
import { CLIENT_NAME_PREFIX } from './constants.js';

/** The query that turns a component id into its client chunk: `<path>.fud?client`. */
export const CLIENT_QUERY = 'client';

/** The module id of a component's client chunk. */
export const clientId = (path: string): string => `${path}?${CLIENT_QUERY}`;

/**
 * The query that turns a component id into its IoC module: `<path>.fud?ioc` (SDD-38 §4.5).
 *
 * A separate artifact from `?client`, and it has to be: the component that declares a
 * provider may be N1 and have no client chunk anyone ever fetches, while its factory still
 * has to reach the browser. Two consumers, two files.
 */
export const IOC_QUERY = 'ioc';

/** The module id of a component's IoC module. */
export const iocId = (path: string): string => `${path}?${IOC_QUERY}`;

/**
 * The chunk NAME of an IoC module: the tag plus `.ioc`, in the same directory the hydration
 * chunks live in.
 *
 * Same directory on purpose — the browser derives its URL with the very `resolveChunk` it
 * already holds, handing it `"<tag>.ioc"` where it would hand a tag. No second resolver, no
 * second map, and nothing new in the manifest.
 */
export const iocChunkName = (tag: string): string => `${CLIENT_NAME_PREFIX}/${iocName(tag)}`;

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
  /** Whether it declares a provider, and so also gets an IoC module (SDD-38 §4.5). */
  readonly owns: boolean;
  /** Whether it injects or provides at all — what decides that the app carries DI. */
  readonly usesDi: boolean;
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
        byTag.set(comp.tag, {
          tag: comp.tag,
          path: comp.path,
          owns: ownsContainer(comp),
          usesDi: usesDependencyInjection(comp),
        });
      }
    }
  }
  // Sorted, so the same project emits the same chunk list twice running: the order the
  // graph happens to be walked in is not a fact anyone should be able to observe.
  return [...byTag.values()].sort((a, b) => a.tag.localeCompare(b.tag));
}

/**
 * Whether the route at `absPath` reaches a single DI call.
 *
 * Asked per route because the wrapper is per route: a route without one opens no container,
 * imports nothing of the injector and publishes no map.
 */
export function routeUsesDi(absPath: string, io: ResolveIo): boolean {
  return hasDependencyInjection(resolveDocument(absPath, io).value);
}

/** A ROUTE that has a client half, and therefore a chunk of its own (SDD-39 §4.5). */
export interface RouteChunk {
  /** `safeName(pattern)` — the name the page publishes and the runtime derives the URL from. */
  readonly name: string;
  /** Absolute path to the route's `.fud`. */
  readonly path: string;
  /** The URL pattern, for a diagnostic that has to name the route the author wrote. */
  readonly pattern: string;
}

/**
 * The routes of the build that get a client chunk — the ones `isReactiveRoute` says have a
 * half to run (SDD-39 §4.5).
 *
 * Unlike a component, a route IS filtered here, and the asymmetry is the level rule itself: a
 * component has no level of its own because an ancestor can make it reactive by handing it a
 * prop, while nobody hands a route anything. What the route says about itself is the whole
 * answer, and a route that says nothing costs no chunk and no request.
 *
 * By PATTERN and not by URL: `/blog/uno` and `/blog/dos` are the same route, the same chunk
 * and the same name.
 */
export function discoverReactiveRoutes(
  builds: readonly RouteBuild[],
  io: ResolveIo,
): readonly RouteChunk[] {
  const out: RouteChunk[] = [];
  for (const rb of builds) {
    if (rb.decision.mode === 'excluded') continue;
    if (!isReactiveRoute(resolveDocument(rb.absPath, io).value)) continue;
    out.push({ name: safeName(rb.route.pattern), path: rb.absPath, pattern: rb.route.pattern });
  }
  return out;
}

/** A path as the module graph spells it: forward slashes, whatever the host filesystem uses. */
const posix = (path: string): string => path.replace(/\\/gu, '/');

/**
 * `.fud` path → the route's chunk name, for the THREE passes that compile a render module.
 *
 * The host plugin, the link pass and the edge pass each run the emit over the same files, and
 * a route that published its name in one and not in the others would be a page whose HTML
 * disagrees with itself depending on who rendered it. One lookup, resolved once per pass.
 *
 * A FUNCTION and not a map, so the normalization cannot be forgotten at one of the three
 * call sites: `discoverRoutes` spells a path the way the filesystem does and Vite hands the
 * same file back with forward slashes — on Windows those are two different strings, and the
 * lookup silently missed every route.
 */
export function routeNameLookup(
  builds: readonly RouteBuild[],
  io: ResolveIo,
): (path: string) => string | undefined {
  const names = new Map(discoverReactiveRoutes(builds, io).map((r) => [posix(r.path), r.name]));
  return (path) => names.get(posix(path));
}
