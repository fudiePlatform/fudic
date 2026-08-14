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
    // `preload` would fetch it as a plain resource and `prefetch` would not parse it;
    // neither of the three evaluates, which is the invariant this channel must keep.
    expect(document.head.querySelector('script')).toBeNull();
  });

  it('reports each chunk by tag when it lands', () => {
    const seen: string[] = [];
    document.addEventListener(WARMED_EVENT, (e) => {
      seen.push((e as CustomEvent<WarmedDetail>).detail.tag);
    });

    createPreloadWarmChannel({ document }).warm(['/h/app-toggle.js'], ['app-toggle']);
    expect(seen).toEqual([]); // ordered, not yet arrived

    links()[0]?.dispatchEvent(new Event('load'));
    expect(seen).toEqual(['app-toggle']);
  });

  it('defaults to the page it runs in', () => {
    createPreloadWarmChannel().warm(['/h/app-solo.js'], ['app-solo']);

    expect(links()).toHaveLength(1);
  });
});
