/**
 * The warm channel of a page with no Service Worker (SDD-17 §4.7.1): a
 * `<link rel="modulepreload">` per chunk.
 *
 * `modulepreload` fetches, parses and puts the module in the module map WITHOUT evaluating
 * it — no `customElements.define` runs, no component code executes — so the founding
 * invariant survives exactly as it does with a worker. What is lost against the worker is
 * persistence in Cache Storage across navigations, and that is a loss of anticipation, never
 * of correctness: hydration works with warm and without it.
 *
 * This is the channel of three of the four uncontrolled cases — no `sw.json`, `pnpm dev`,
 * and an insecure context — and it is the reason `pnpm dev` can measure warm at all.
 */

import { announceWarmed, type WarmChannel } from './channel.js';

export interface PreloadChannelConfig {
  /** The document whose `<head>` carries the links and which receives `fud:warmed`. */
  readonly document?: Document;
}

export function createPreloadWarmChannel(config: PreloadChannelConfig = {}): WarmChannel {
  const doc = config.document ?? document;
  return {
    warm(urls: readonly string[], tags: readonly string[]): void {
      urls.forEach((url, index) => {
        // Parallel by contract (§3): the order builds both arrays in one pass, so an
        // index that exists in one exists in the other.
        const tag = tags[index]!;
        const link = doc.createElement('link');
        link.rel = 'modulepreload';
        link.href = url;
        link.addEventListener('load', () => {
          announceWarmed(doc, tag);
        });
        doc.head.appendChild(link);
      });
    },
  };
}
