/**
 * SDD-17 §4.7.1: the channel of a page with no Service Worker. It fetches and parses,
 * it does NOT evaluate, and it says so when the chunk is in place.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createPreloadWarmChannel } from '../../src/hydrate/warm/preload.js';
import { WARMED_EVENT, type WarmedDetail } from '../../src/hydrate/warm/channel.js';

function links(): HTMLLinkElement[] {
  return [...document.head.querySelectorAll('link')];
}

/** The tags announced from now on. */
function listen(): string[] {
  const seen: string[] = [];
  document.addEventListener(WARMED_EVENT, (e) => {
    seen.push((e as CustomEvent<WarmedDetail>).detail.tag);
  });
  return seen;
}

/** Let the promises the channel chains settle. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** Fire `load` on every link of the head whose URL ends in `path`. */
function land(...paths: readonly string[]): void {
  for (const link of links()) {
    if (paths.some((p) => link.href.endsWith(p))) link.dispatchEvent(new Event('load'));
  }
}

describe('the modulepreload channel', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
  });

  it('deposits one modulepreload per chunk, and evaluates none of them', () => {
    createPreloadWarmChannel({ document }).warm(
      ['/h/app-counter.js', '/h/app-toggle.js'],
      ['app-counter', 'app-toggle'],
    );

    expect(links().map((l) => [l.rel, l.getAttribute('href')])).toEqual([
      ['modulepreload', '/h/app-counter.js'],
      ['modulepreload', '/h/app-toggle.js'],
    ]);
    // Low, like the worker's `fetch(url, { priority: 'low' })`: warm is background network
    // in both channels, or it is not warm (§4.7).
    expect(links().map((l) => l.getAttribute('fetchpriority'))).toEqual(['low', 'low']);
    // `preload` would fetch it as a plain resource and `prefetch` would not parse it;
    // neither of the three evaluates, which is the invariant this channel must keep.
    expect(document.head.querySelector('script')).toBeNull();
  });

  it('reports each chunk by tag when it lands, and not when it fails', async () => {
    const seen = listen();

    createPreloadWarmChannel({ document }).warm(
      ['/h/app-toggle.js', '/h/app-broken.js'],
      ['app-toggle', 'app-broken'],
    );
    await flush();
    expect(seen).toEqual([]); // ordered, not yet arrived

    links()[0]?.dispatchEvent(new Event('load'));
    links()[1]?.dispatchEvent(new Event('error'));
    await flush();
    expect(seen).toEqual(['app-toggle']);
  });

  it('defaults to the page it runs in', () => {
    createPreloadWarmChannel().warm(['/h/app-solo.js'], ['app-solo']);

    expect(links()).toHaveLength(1);
  });
});

/** BUG-53 §4.3: with the manifest's graph, a link per file of the chunk's graph. */
describe('the modulepreload channel with a graph', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
  });

  const GRAPH: Readonly<Record<string, readonly string[]>> = {
    '/h/app-counter.js': ['/assets/element.js', '/_fudic/core/live.js'],
    '/h/app-toggle.js': ['/assets/element.js', '/_fudic/core/signal.js'],
  };
  const graph = (url: string): Promise<readonly string[]> => Promise.resolve(GRAPH[url] ?? []);
  const hrefs = (): string[] => links().map((l) => new URL(l.href).pathname);

  it('preloads the chunk at once and its graph when known, all at a low priority', async () => {
    createPreloadWarmChannel({ document, graph }).warm(['/h/app-counter.js'], ['app-counter']);
    // The chunk does not wait for the manifest.
    expect(hrefs()).toEqual(['/h/app-counter.js']);
    await flush();
    expect(hrefs()).toEqual(['/h/app-counter.js', '/assets/element.js', '/_fudic/core/live.js']);
    expect(new Set(links().map((l) => l.getAttribute('fetchpriority')))).toEqual(new Set(['low']));
  });

  it('criterion 5: one link per URL, across tags and against what the head preloaded', async () => {
    // The head's own preload of a runtime piece, by another spelling of the same URL.
    const head = document.createElement('link');
    head.rel = 'modulepreload';
    head.href = new URL('/_fudic/core/signal.js', document.baseURI).href;
    document.head.appendChild(head);
    const seen = listen();

    const channel = createPreloadWarmChannel({ document, graph });
    channel.warm(['/h/app-counter.js', '/h/app-toggle.js'], ['app-counter', 'app-toggle']);
    await flush();
    expect(hrefs().toSorted()).toEqual(
      [
        '/_fudic/core/live.js',
        '/_fudic/core/signal.js',
        '/assets/element.js',
        '/h/app-counter.js',
        '/h/app-toggle.js',
      ].toSorted(),
    );

    // criterion 6: announced once every file of the tag landed, the head's included.
    land('/h/app-toggle.js');
    await flush();
    expect(seen).toEqual([]);
    land('/assets/element.js');
    await flush();
    expect(seen).toEqual(['app-toggle']);
    land('/h/app-counter.js', '/_fudic/core/live.js');
    await flush();
    expect(seen).toEqual(['app-toggle', 'app-counter']);
  });

  it('criterion 6: a file of the graph that fails keeps the tag unannounced', async () => {
    const seen = listen();
    createPreloadWarmChannel({ document, graph }).warm(['/h/app-counter.js'], ['app-counter']);
    await flush();
    land('/h/app-counter.js', '/assets/element.js');
    links()
      .find((l) => l.href.endsWith('/_fudic/core/live.js'))
      ?.dispatchEvent(new Event('error'));
    await flush();
    expect(seen).toEqual([]);
  });

  it('criterion 7: an empty graph preloads the chunk alone', async () => {
    const seen = listen();
    createPreloadWarmChannel({ document, graph: () => Promise.resolve([]) }).warm(
      ['/h/app-counter.js'],
      ['app-counter'],
    );
    await flush();
    expect(hrefs()).toEqual(['/h/app-counter.js']);
    land('/h/app-counter.js');
    await flush();
    expect(seen).toEqual(['app-counter']);
  });
});
