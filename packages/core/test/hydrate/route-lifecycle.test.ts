/**
 * SDD-86 §4.1, criterion 29 — a route's life is its document's.
 *
 * After `h()`, `on()`. A route whose `@code` uses `onConnect`, `onDisconnect` or `onDispose`
 * (its controller has `on` / `off`) follows the page: `pagehide` → `off()`, and `r()` when the
 * page is not kept; `pageshow` from the back-forward cache → `on()`. One that does not listens
 * to nothing. Never `unload` nor `beforeunload`: they take the page out of the bfcache.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browserDom } from '@fudic/dom';
import { followPage } from '../../src/hydrate/page-life.js';
import { installHydration } from '../../src/hydrate/install.js';
import { signal } from '../../src/signal.js';
import { publish, TestRegistry } from './_page.js';
import type { RouteController } from '../../src/hydrate/chunks.js';

/** A page transition event as the browser fires it: `persisted` says whether the page is kept. */
function transition(type: 'pagehide' | 'pageshow', persisted: boolean): Event {
  const event = new Event(type);
  Object.defineProperty(event, 'persisted', { value: persisted });
  return event;
}

/** A view that records which events were listened to. */
function view(): { target: EventTarget; listened: string[] } {
  const target = new EventTarget();
  const listened: string[] = [];
  const add = target.addEventListener.bind(target);
  target.addEventListener = (type: string, ...rest: unknown[]) => {
    listened.push(type);
    (add as (...a: unknown[]) => void)(type, ...rest);
  };
  return { target, listened };
}

function route(log: string[], live = true): RouteController {
  const base: RouteController = {
    h: () => log.push('h'),
    u: () => log.push('u'),
    r: () => log.push('r'),
  };
  return live ? { ...base, on: () => log.push('on'), off: () => log.push('off') } : base;
}

describe('a route without hooks of connecting or leaving (criterion 29)', () => {
  it('registers no listener at all, and calls nothing', () => {
    const log: string[] = [];
    const { target, listened } = view();
    followPage(route(log, false), target);
    expect(listened).toEqual([]);
    target.dispatchEvent(transition('pagehide', false));
    expect(log).toEqual([]);
  });
});

describe('a route with them (§4.1)', () => {
  it('connects at once and listens only to pagehide and pageshow', () => {
    const log: string[] = [];
    const { target, listened } = view();
    followPage(route(log), target);
    expect(log).toEqual(['on']);
    expect([...listened].sort()).toEqual(['pagehide', 'pageshow']);
    expect(listened).not.toContain('unload');
    expect(listened).not.toContain('beforeunload');
  });

  it('pagehide not persisted: off, then r — the page is not coming back', () => {
    const log: string[] = [];
    const { target } = view();
    followPage(route(log), target);
    target.dispatchEvent(transition('pagehide', false));
    expect(log).toEqual(['on', 'off', 'r']);
  });

  it('pagehide persisted: off and no r — into the bfcache', () => {
    const log: string[] = [];
    const { target } = view();
    followPage(route(log), target);
    target.dispatchEvent(transition('pagehide', true));
    expect(log).toEqual(['on', 'off']);
  });

  it('pageshow persisted: on again — back from the bfcache, never disposed', () => {
    const log: string[] = [];
    const { target } = view();
    followPage(route(log), target);
    target.dispatchEvent(transition('pagehide', true));
    target.dispatchEvent(transition('pageshow', true));
    target.dispatchEvent(transition('pagehide', true));
    target.dispatchEvent(transition('pageshow', true));
    expect(log).toEqual(['on', 'off', 'on', 'off', 'on']);
  });

  it('the first pageshow of a load (not persisted) does not connect a second time', () => {
    const log: string[] = [];
    const { target } = view();
    followPage(route(log), target);
    target.dispatchEvent(transition('pageshow', false));
    expect(log).toEqual(['on']);
  });

  it('a page kept and then left for good: on, off, on, off, r', () => {
    const log: string[] = [];
    const { target } = view();
    followPage(route(log), target);
    target.dispatchEvent(transition('pagehide', true));
    target.dispatchEvent(transition('pageshow', true));
    target.dispatchEvent(transition('pagehide', false));
    expect(log).toEqual(['on', 'off', 'on', 'off', 'r']);
  });
});

describe('installHydration raises the route and follows the window (§4.1)', () => {
  beforeEach(() => {
    publish();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Install the runtime with a route chunk whose controller is `controller(log)`. */
  async function raise(live: boolean): Promise<{ log: string[]; types: string[] }> {
    const spy = vi.spyOn(window, 'addEventListener');
    publish({ route: 'ruta', bodyId: 0, state: [[0, 0], []] });
    const button = document.createElement('button');
    document.body.appendChild(button);
    const log: string[] = [];
    installHydration({
      root: document,
      document,
      registry: new TestRegistry(),
      importDeferred: async () => ({ dom: browserDom, signal }),
      resolveChunk: (name) => name,
      importModule: async (url) => (url === 'ruta' ? { default: () => route(log, live) } : undefined),
    });
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const types = spy.mock.calls.map((c) => c[0]).filter((t) => /unload|page(hide|show)/u.test(t));
    return { log, types };
  }

  it('h, then on — and the window is followed with pagehide / pageshow only', async () => {
    const { log, types } = await raise(true);
    expect(log).toEqual(['h', 'on']);
    expect([...types].sort()).toEqual(['pagehide', 'pageshow']);
    window.dispatchEvent(transition('pagehide', true));
    window.dispatchEvent(transition('pageshow', true));
    expect(log).toEqual(['h', 'on', 'off', 'on']);
  });

  it('a route without them: h, and not one page listener', async () => {
    const { log, types } = await raise(false);
    expect(log).toEqual(['h']);
    expect(types).toEqual([]);
  });
});
