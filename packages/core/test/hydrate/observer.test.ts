/**
 * SDD-17 §4.7: the warm trigger. Network in proportion to what the user sees, the whole
 * closure a gesture will need, once per tag, and out of the main thread's way.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  idleSchedule,
  startWarmObserver,
  viewportObserver,
  type ObserveVisible,
  type Schedule,
} from '../../src/hydrate/warm/observer.js';
import { readPageMaps } from '../../src/hydrate/maps.js';
import { type WarmChannel } from '../../src/hydrate/warm/channel.js';
import { host, publish } from './_page.js';

interface Order {
  readonly urls: readonly string[];
  readonly tags: readonly string[];
}

/** A channel that records what it was asked to deposit, and deposits nothing. */
function recorder(): { readonly orders: Order[]; readonly channel: WarmChannel } {
  const orders: Order[] = [];
  return {
    orders,
    channel: {
      warm(urls, tags): void {
        orders.push({ urls, tags });
      },
    },
  };
}

/** The viewport, driven by hand: `show` is an instance scrolling into view. */
function viewport(): { readonly observe: ObserveVisible; show(target: Element): void } {
  let watched: readonly Element[] = [];
  let onVisible: (target: Element) => void = () => undefined;
  return {
    observe: (targets, callback): void => {
      watched = targets;
      onVisible = callback;
    },
    show(target: Element): void {
      if (watched.includes(target)) onVisible(target);
    },
  };
}

/** Run the warm work at once: the idle hole is a separate question from what is warmed. */
const now: Schedule = (task) => {
  task();
};

describe('the warm trigger', () => {
  beforeEach(() => {
    publish({
      tree: { 'wt-parent': ['wt-child'], 'wt-child': ['wt-grandchild'] },
      bus: { 'wt-emitter': ['wt-cart'] },
    });
  });

  it('warms the transitive closure, because that is what the gesture will need', () => {
    const parent = host('wt-parent', 0);
    const { orders, channel } = recorder();
    const eye = viewport();
    startWarmObserver({
      maps: readPageMaps(document),
      resolveChunk: (tag) => `/h/${tag}.js`,
      channel,
      root: document,
      observe: eye.observe,
      schedule: now,
    });

    eye.show(parent);

    // The subtree, recursively: warming the host alone would leave the cascade paying
    // network inside the gesture (§4.4).
    expect(orders).toEqual([
      {
        tags: ['wt-parent', 'wt-child', 'wt-grandchild'],
        urls: ['/h/wt-parent.js', '/h/wt-child.js', '/h/wt-grandchild.js'],
      },
    ]);
  });

  it('warms the bus receivers of an emitter, which are not in its subtree at all', () => {
    const emitter = host('wt-emitter', 0);
    const { orders, channel } = recorder();
    const eye = viewport();
    startWarmObserver({
      maps: readPageMaps(document),
      resolveChunk: (tag) => `/h/${tag}.js`,
      channel,
      root: document,
      observe: eye.observe,
      schedule: now,
    });

    eye.show(emitter);

    expect(orders[0]?.tags).toEqual(['wt-emitter', 'wt-cart']);
  });

  it('warms by tag and not by instance: N instances in view cost one order', () => {
    const first = host('wt-parent', 0);
    const second = host('wt-parent', 1);
    const { orders, channel } = recorder();
    const eye = viewport();
    startWarmObserver({
      maps: readPageMaps(document),
      resolveChunk: (tag) => `/h/${tag}.js`,
      channel,
      root: document,
      observe: eye.observe,
      schedule: now,
    });

    eye.show(first);
    eye.show(second);

    expect(orders).toHaveLength(1);
  });

  it('does not touch the network for a tag whose instances stay below the fold', () => {
    host('wt-parent', 0);
    const below = host('wt-emitter', 1);
    const { orders, channel } = recorder();
    const eye = viewport();
    startWarmObserver({
      maps: readPageMaps(document),
      resolveChunk: (tag) => `/h/${tag}.js`,
      channel,
      root: document,
      observe: eye.observe,
      schedule: now,
    });

    eye.show(document.querySelector('wt-parent')!);

    expect(orders.flatMap((o) => o.tags)).not.toContain('wt-emitter');
    // And it is warmed the moment it scrolls into view, not before.
    eye.show(below);
    expect(orders.flatMap((o) => o.tags)).toContain('wt-emitter');
  });

  it('orders the deposit in the background, never inside the visibility callback', () => {
    const parent = host('wt-parent', 0);
    const { orders, channel } = recorder();
    const eye = viewport();
    const deferred: (() => void)[] = [];
    startWarmObserver({
      maps: readPageMaps(document),
      resolveChunk: (tag) => `/h/${tag}.js`,
      channel,
      root: document,
      observe: eye.observe,
      schedule: (task) => deferred.push(task),
    });

    eye.show(parent);
    expect(orders).toEqual([]); // nothing was stolen from the main thread

    deferred.forEach((task) => task());
    expect(orders).toHaveLength(1);
  });

  it('finds instances inside shadow roots, where a document query cannot reach', () => {
    const parent = host('wt-parent', 0);
    const child = host('wt-child', 1, parent.shadowRoot!);
    const { orders, channel } = recorder();
    const eye = viewport();
    startWarmObserver({
      maps: readPageMaps(document),
      resolveChunk: (tag) => `/h/${tag}.js`,
      channel,
      root: document,
      observe: eye.observe,
      schedule: now,
    });

    eye.show(child);

    expect(orders[0]?.tags).toEqual(['wt-child', 'wt-grandchild']);
  });
});

/** A stand-in for the platform observer, so the default port is verifiable. */
class FakeIntersectionObserver {
  static last: FakeIntersectionObserver | null = null;
  readonly observed: Element[] = [];
  readonly unobserved: Element[] = [];
  constructor(
    readonly callback: (entries: readonly { isIntersecting: boolean; target: Element }[]) => void,
    readonly options: unknown,
  ) {
    FakeIntersectionObserver.last = this;
  }
  observe(target: Element): void {
    this.observed.push(target);
  }
  unobserve(target: Element): void {
    this.unobserved.push(target);
  }
}

describe('the platform ports', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('observes every host once, at the viewport edge, and lets it go on the first entry', () => {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    publish();
    const a = host('wt-a', 0);
    const b = host('wt-b', 1);
    const seen: Element[] = [];

    viewportObserver([a, b], (target) => seen.push(target));
    const observer = FakeIntersectionObserver.last!;
    observer.callback([
      { isIntersecting: false, target: a },
      { isIntersecting: true, target: b },
    ]);

    expect(observer.observed).toEqual([a, b]);
    expect(observer.options).toEqual({ rootMargin: '0px', threshold: 0 });
    // Only what is visible, and never twice: unobserved before the callback runs.
    expect(seen).toEqual([b]);
    expect(observer.unobserved).toEqual([b]);
  });

  it('waits for an idle hole, with a bound so a busy page still warms', () => {
    const calls: { task: () => void; options: unknown }[] = [];
    vi.stubGlobal('requestIdleCallback', (task: () => void, options: unknown) => {
      calls.push({ task, options });
      return 1;
    });
    let ran = 0;

    idleSchedule(() => {
      ran += 1;
    });

    expect(calls[0]?.options).toEqual({ timeout: 800 });
    calls[0]?.task();
    expect(ran).toBe(1);
  });

  it('falls back to a plain timeout where the engine has no idle callback', () => {
    const original = Reflect.get(globalThis, 'requestIdleCallback') as unknown;
    Reflect.deleteProperty(globalThis, 'requestIdleCallback');
    try {
      vi.useFakeTimers();
      let ran = 0;

      idleSchedule(() => {
        ran += 1;
      });

      expect(ran).toBe(0);
      vi.advanceTimersByTime(200);
      expect(ran).toBe(1);
    } finally {
      vi.useRealTimers();
      // Restored only if it was there: writing `undefined` back would leave the property
      // present and the guard would then call it.
      if (original !== undefined) Reflect.set(globalThis, 'requestIdleCallback', original);
    }
  });
});
