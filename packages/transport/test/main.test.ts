import { afterEach, describe, expect, it, vi } from 'vitest';

import { notifyRuntimeUsed } from '../src/main.js';
import { RUNTIME_MESSAGE } from '../src/messages.js';

/**
 * The one load a Service Worker cannot intercept — its own first one (SDD-45 §4.5.1).
 *
 * A worker installs during that load and claims at the end of it, so every file the page
 * fetched went past it: without this notice the runtime is cached on the SECOND visit, and
 * the second visit is therefore the first one that works offline. What the page reports it
 * has already downloaded, so acting on it costs the worker a read of the browser's own HTTP
 * cache.
 *
 * Read off the Performance timeline and not off a list the build wrote, because what a page
 * used is a fact of THAT page — its own pieces, the ones a hydrated component dragged in, the
 * ones §4.4.1 defers — so nothing here has to be kept in step with a manifest.
 */

const ORIGIN = 'https://shop.test/blog/x';

/** The three globals a document has and Node does not; `performance` it already has. */
function page(options: {
  readonly controller?: unknown;
  readonly active?: unknown;
  readonly resources?: readonly string[];
}): { readonly posted: unknown[] } {
  const posted: unknown[] = [];
  const worker = {
    postMessage: (message: unknown): void => {
      posted.push(message);
    },
  };
  const controller = options.controller === undefined ? worker : options.controller;
  vi.stubGlobal('location', { href: ORIGIN });
  vi.stubGlobal('navigator', {
    serviceWorker: {
      controller,
      ready: Promise.resolve({ active: options.active === undefined ? worker : options.active }),
    },
  });
  vi.stubGlobal('performance', {
    getEntriesByType: (type: string): readonly { readonly name: string }[] =>
      type === 'resource' ? (options.resources ?? []).map((name) => ({ name })) : [],
  });
  return { posted };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('notifyRuntimeUsed', () => {
  it('reports the pieces the page fetched, resolved against the document', async () => {
    const { posted } = page({
      resources: [
        'https://shop.test/_fudic/0.0.1/core/hydrate.js',
        'https://shop.test/assets/app-abc123.js',
        'https://shop.test/_fudic/0.0.1/dom/browser.js',
        'https://cdn.test/_fudic/0.0.1/core/signal.js',
      ],
    });

    // The prefix is passed in — where the runtime lives on the origin is a convention this
    // package does not own, the generated boot script does — and it is resolved against the
    // document, so a piece of another origin that happens to share the path is not ours.
    await notifyRuntimeUsed('/_fudic/');

    expect(posted).toEqual([
      {
        type: RUNTIME_MESSAGE,
        urls: [
          'https://shop.test/_fudic/0.0.1/core/hydrate.js',
          'https://shop.test/_fudic/0.0.1/dom/browser.js',
        ],
      },
    ]);
  });

  it('says nothing when the page used no piece', async () => {
    const { posted } = page({ resources: ['https://shop.test/assets/app-abc123.js'] });

    // A page with nothing to hydrate loads no piece of the runtime, and an empty notice is
    // a message the worker would have to handle for no reason.
    await notifyRuntimeUsed('/_fudic/');

    expect(posted).toEqual([]);
  });

  it('falls back to the registration active worker when nothing controls the page yet', async () => {
    const { posted } = page({
      controller: null,
      resources: ['https://shop.test/_fudic/0.0.1/core/hydrate.js'],
    });

    // This is the first load, so there is usually no controller: the worker that just
    // installed is `active` on the registration, and it is the one that can keep the bytes.
    await notifyRuntimeUsed('/_fudic/');

    expect(posted).toHaveLength(1);
  });

  it('says nothing when there is no worker to tell', async () => {
    const { posted } = page({
      controller: null,
      active: null,
      resources: ['https://shop.test/_fudic/0.0.1/core/hydrate.js'],
    });

    // Nothing to tell yet; the next navigation will be controlled.
    await notifyRuntimeUsed('/_fudic/');

    expect(posted).toEqual([]);
  });
});
