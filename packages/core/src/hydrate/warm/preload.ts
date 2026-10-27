/**
 * The warm channel of a page with no Service Worker (SDD-17 §4.7.1): a
 * `<link rel="modulepreload">` per file of each chunk's graph.
 *
 * `modulepreload` fetches, parses and puts the module in the module map WITHOUT evaluating
 * it — no `customElements.define` runs, no component code executes — so the founding
 * invariant survives exactly as it does with a worker. What is lost against the worker is
 * persistence in Cache Storage across navigations, and that is a loss of anticipation, never
 * of correctness: hydration works with warm and without it.
 *
 * This is the channel of three of the four uncontrolled cases — no `sw.json`, `pnpm dev`,
 * and an insecure context — and it is the reason `pnpm dev` can measure warm at all.
 *
 * **The page names the graph, because the browser will not.** Measured in Chromium: a
 * `<link rel="modulepreload">` inserted by script fetches the module and none of its static
 * imports until something evaluates it — with or without `fetchpriority`. So the channel is
 * handed `graph`, which answers what each chunk imports: the build lists it in the manifest
 * (BUG-53 §4.1) — shared chunks and published runtime pieces — and the coordinator reads it
 * from there, once per page. Without it the first gesture paid for that code inside itself.
 *
 * **Never under a worker.** A `<link>` preload of a file a Service Worker serves is fetched in
 * one world and asked for in the other: Chrome downloads it twice and throws the preload
 * away with a warning. The worker's channel deposits the graph itself and inserts no link.
 *
 * **No graph in dev.** The dev server serves the source modules unbundled, so the graph is
 * the source tree and cannot be named before it is asked for (BUG-53 §6): there the channel
 * preloads the chunk alone, and the first gesture pays for the rest.
 */

import { announceWarmed, type WarmChannel } from './channel.js';

export interface PreloadChannelConfig {
  /** The document whose `<head>` carries the links and which receives `fud:warmed`. */
  readonly document?: Document;
  /**
   * The graph of each chunk the channel is asked to warm, by URL. A promise because, with no
   * worker, it comes from fetching the manifest. Absent in dev.
   *
   * It does not reject: a graph that cannot be read is an empty one, and the channel then
   * preloads the chunk alone.
   */
  readonly graph?: (chunkUrl: string) => Promise<readonly string[]>;
}

export function createPreloadWarmChannel(config: PreloadChannelConfig = {}): WarmChannel {
  const doc = config.document ?? document;
  const { graph } = config;
  /** Absolute URL → whether its preload landed. One link per URL, whoever asked first. */
  const placed = new Map<string, Promise<boolean>>();

  const preload = (url: string): Promise<boolean> => {
    const link = doc.createElement('link');
    link.rel = 'modulepreload';
    link.href = url;
    // `link.href` is the absolute URL: the one spelling two tags, or the head, share.
    const href = link.href;
    const known = placed.get(href);
    if (known !== undefined) return known;
    // A preload the HEAD wrote is the load closure of the coordinator (SDD-45 §4.5), and the
    // coordinator is running: a module is evaluated only once every static import of it has
    // loaded, so that file is in the module map already, and its link fired its `load` long
    // before anybody could listen to it.
    const ready = [...doc.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"]')].some(
      (existing) => existing.href === href,
    );
    const landed = ready
      ? Promise.resolve(true)
      : new Promise<boolean>((resolve) => {
          link.addEventListener('load', () => {
            resolve(true);
          });
          link.addEventListener('error', () => {
            resolve(false);
          });
        });
    placed.set(href, landed);
    if (!ready) {
      // The same rule the worker channel follows with `fetch(url, { priority: 'low' })`
      // (§4.7): warm is background network and must not compete with the critical path of
      // the load, nor with an interaction in flight. Without it a `modulepreload` is
      // fetched at a script's own priority, which is the opposite of what warm is for.
      link.setAttribute('fetchpriority', 'low');
      doc.head.appendChild(link);
    }
    return landed;
  };

  return {
    warm(urls: readonly string[], tags: readonly string[]): void {
      urls.forEach((url, index) => {
        // Parallel by contract (§3): the order builds both arrays in one pass, so an
        // index that exists in one exists in the other.
        const tag = tags[index]!;
        // The chunk at once, its graph when it is known: the manifest is not on the
        // chunk's critical path.
        const files = [
          preload(url),
          ...(graph === undefined ? [] : [graph(url).then((deps) => Promise.all(deps.map(preload)))]),
        ];
        // Announced once every file of the tag has landed, the ones that were already there
        // included; one that failed keeps the tag unannounced — the worker's rule.
        void Promise.all(files).then((landed) => {
          if (landed.flat().every(Boolean)) announceWarmed(doc, tag);
        });
      });
    },
  };
}
