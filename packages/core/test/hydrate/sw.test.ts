/**
 * SDD-17 §4.7.1: the channel of a page served by the render Service Worker — and the case
 * that makes it more than a `postMessage`: a first load has a worker and no controller.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createServiceWorkerWarmChannel,
  WARM_MESSAGE,
  WARMED_MESSAGE,
  type ServiceWorkerHost,
  type WarmedMessage,
} from '../../src/hydrate/warm/sw.js';
import { WARMED_EVENT, type WarmedDetail } from '../../src/hydrate/warm/channel.js';

/** A container whose control can be handed over, like the platform's after `claim()`. */
class FakeContainer implements ServiceWorkerHost {
  readonly posted: unknown[] = [];
  readonly #listeners = new Map<string, ((event: Event) => void)[]>();
  controller: { postMessage(message: unknown): void } | null = null;

  addEventListener(type: string, listener: (event: Event) => void): void {
    this.#listeners.set(type, [...(this.#listeners.get(type) ?? []), listener]);
  }

  /** What `clients.claim()` looks like from the page. */
  claim(): void {
    this.controller = { postMessage: (message) => this.posted.push(message) };
    this.#emit('controllerchange', new Event('controllerchange'));
  }

  deliver(data: unknown): void {
    this.#emit('message', new MessageEvent('message', { data }));
  }

  #emit(type: string, event: Event): void {
    for (const listener of this.#listeners.get(type) ?? []) listener(event);
  }
}

describe('the Service Worker warm channel', () => {
  it('orders the deposit through the controller', () => {
    const container = new FakeContainer();
    container.claim();

    createServiceWorkerWarmChannel({ container, document }).warm(
      ['/assets/h/app-counter-abcd.js'],
      ['app-counter'],
    );

    expect(container.posted).toEqual([
      { type: WARM_MESSAGE, urls: ['/assets/h/app-counter-abcd.js'], tags: ['app-counter'] },
    ]);
    expect(WARM_MESSAGE).toBe('fudic:warm');
  });

  it('says nothing to nobody, and says it once the worker takes over', () => {
    // The uncontrolled first load: posting to a null controller does not fail, it just
    // loses the warm in silence.
    const container = new FakeContainer();
    const channel = createServiceWorkerWarmChannel({ container, document });

    channel.warm(['/h/a.js'], ['app-a']);
    channel.warm(['/h/b.js'], ['app-b']);
    expect(container.posted).toEqual([]);

    container.claim();
    expect(container.posted).toEqual([
      { type: WARM_MESSAGE, urls: ['/h/a.js'], tags: ['app-a'] },
      { type: WARM_MESSAGE, urls: ['/h/b.js'], tags: ['app-b'] },
    ]);

    // Flushed, not replayed: a later order goes straight out and the queue stays empty.
    channel.warm(['/h/c.js'], ['app-c']);
    expect(container.posted).toHaveLength(3);
  });

  it('reports by tag what the worker confirms, and ignores the rest of the traffic', () => {
    const container = new FakeContainer();
    const seen: string[] = [];
    document.addEventListener(WARMED_EVENT, (e) => {
      seen.push((e as CustomEvent<WarmedDetail>).detail.tag);
    });
    createServiceWorkerWarmChannel({ container, document });

    container.deliver(undefined);
    container.deliver({ type: 'fudic:here' });
    expect(seen).toEqual([]);

    const confirmation: WarmedMessage = {
      type: WARMED_MESSAGE,
      urls: ['/h/a.js', '/h/b.js'],
      tags: ['app-a', 'app-b'],
    };
    container.deliver(confirmation);

    expect(seen).toEqual(['app-a', 'app-b']);
  });

  it('defaults to the page it runs in: its container and its document', () => {
    const container = new FakeContainer();
    vi.stubGlobal('navigator', { serviceWorker: container });
    const seen: string[] = [];
    document.addEventListener(WARMED_EVENT, (e) => {
      seen.push((e as CustomEvent<WarmedDetail>).detail.tag);
    });
    try {
      const channel = createServiceWorkerWarmChannel();
      container.claim();
      channel.warm(['/h/a.js'], ['app-a']);
      container.deliver({ type: WARMED_MESSAGE, urls: ['/h/a.js'], tags: ['app-a'] });

      expect(container.posted).toHaveLength(1);
      expect(seen).toEqual(['app-a']);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
