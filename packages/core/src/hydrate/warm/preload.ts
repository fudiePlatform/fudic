import { announceWarmed, type WarmChannel } from './channel.js';

export interface PreloadChannelConfig {
  /** Defaults to the global `document`. */
  readonly document?: Document;
  /**
   * The files each chunk imports, by chunk URL. A `modulepreload` added by script does not
   * fetch the module's imports, so they are preloaded one by one. Absent in dev, where the
   * graph is the unbundled source. Must not reject: an unreadable graph is an empty one.
   */
  readonly graph?: (chunkUrl: string) => Promise<readonly string[]>;
}

/**
 * The warm channel for a page no Service Worker controls: a low-priority
 * `<link rel="modulepreload">` per file. Never use it under a worker: the browser would
 * download each file twice.
 */
export function createPreloadWarmChannel(config: PreloadChannelConfig = {}): WarmChannel {
  const doc = config.document ?? document;
  const { graph } = config;
  // Absolute URL → whether its preload landed. One link per URL.
  const placed = new Map<string, Promise<boolean>>();

  const preload = (url: string): Promise<boolean> => {
    const link = doc.createElement('link');
    link.rel = 'modulepreload';
    link.href = url;
    // The resolved, absolute spelling.
    const href = link.href;
    const known = placed.get(href);
    if (known !== undefined) return known;
    // A preload already in the document was written by the page head, and its `load` fired
    // before anyone could listen: the module is loaded.
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
      link.setAttribute('fetchpriority', 'low');
      doc.head.appendChild(link);
    }
    return landed;
  };

  return {
    warm(urls: readonly string[], tags: readonly string[]): void {
      urls.forEach((url, index) => {
        const tag = tags[index]!;
        const files = [
          preload(url),
          ...(graph === undefined ? [] : [graph(url).then((deps) => Promise.all(deps.map(preload)))]),
        ];
        // Announced only once every file landed.
        void Promise.all(files).then((landed) => {
          if (landed.flat().every(Boolean)) announceWarmed(doc, tag);
        });
      });
    },
  };
}
