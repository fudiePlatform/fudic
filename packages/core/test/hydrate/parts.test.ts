/**
 * SDD-70 §4.4, §6.18–§6.20 — the browser reads a page that arrives in parts.
 *
 * The document is fed the way the parser feeds it: a part's block, then what the part painted,
 * then its marker, one append at a time, with `readyState` held at `loading` until the test
 * says the document is complete. happy-dom delivers the observer's records on a microtask, so
 * `settle` is what lets each append be heard.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { browserDom } from '@fudic/dom';
import { installHydration } from '../../src/hydrate/install.js';
import { readParts, PART_ATTR, PART_END } from '../../src/hydrate/parts.js';
import { readPageMaps, type PartBlock } from '../../src/hydrate/maps.js';
import { signal } from '../../src/signal.js';
import { host, publish, TestRegistry } from './_page.js';

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function click(target: EventTarget): void {
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
}

/** The block of part `index`, appended where the parser would put it. */
function block(index: number, value: PartBlock, parent: ParentNode = document.body): void {
  const el = document.createElement('script');
  el.setAttribute('type', 'application/json');
  el.setAttribute(PART_ATTR, String(index));
  el.textContent = JSON.stringify(value);
  parent.appendChild(el);
}

/** The marker that closes a part. */
function end(parent: ParentNode = document.body): void {
  parent.appendChild(document.createComment(PART_END));
}

/** Every marker left in the document. */
function markers(): number {
  const walker = document.createTreeWalker(document, NodeFilter.SHOW_COMMENT);
  let n = 0;
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if ((node as Comment).data === PART_END) n += 1;
  }
  return n;
}

/** Hold the document at `loading`; `complete()` lets it go and fires `DOMContentLoaded`. */
function loading(): { complete: () => void } {
  Object.defineProperty(document, 'readyState', { value: 'loading', configurable: true });
  return {
    complete: () => {
      Reflect.deleteProperty(document, 'readyState');
      document.dispatchEvent(new Event('DOMContentLoaded'));
    },
  };
}

afterEach(() => {
  Reflect.deleteProperty(document, 'readyState');
});

describe('readParts — the reader on its own', () => {
  beforeEach(() => {
    publish();
  });

  it('a document already complete is read in one go, and nothing of it stays', async () => {
    block(0, { route: 'r' });
    document.body.appendChild(document.createElement('p'));
    // An author's comment is not a marker, and stays.
    document.body.appendChild(document.createComment('nota'));
    end();
    // Part 1 says nothing, so it writes no block: its marker alone closes it.
    document.body.appendChild(document.createElement('p'));
    end();
    const seen: [PartBlock, number][] = [];
    await readParts({ document, onPart: (b, i) => seen.push([b, i]) });
    expect(seen).toEqual([
      [{ route: 'r' }, 0],
      [{}, 1],
    ]);
    expect(document.querySelector(`script[${PART_ATTR}]`)).toBeNull();
    expect(markers()).toBe(0);
    expect(document.querySelectorAll('p')).toHaveLength(2);
    expect([...document.body.childNodes].some((n) => n.nodeType === 8 && (n as Comment).data === 'nota')).toBe(true);
  });

  it('a document still loading: a part is read when its marker arrives, and not before', async () => {
    const doc = loading();
    block(0, { route: 'r' });
    end();
    const seen: number[] = [];
    let finished = false;
    const reading = readParts({ document, onPart: (_b, i) => seen.push(i) }).then(() => {
      finished = true;
    });
    // What arrived before the reader did is read at once.
    expect(seen).toEqual([0]);

    block(1, { fields: { users: { ok: [] } } });
    document.body.appendChild(document.createElement('p'));
    await settle();
    expect(seen).toEqual([0]);
    expect(document.querySelector(`script[${PART_ATTR}="1"]`)).not.toBeNull();

    end();
    await settle();
    expect(seen).toEqual([0, 1]);
    expect(document.querySelector(`script[${PART_ATTR}]`)).toBeNull();
    expect(markers()).toBe(0);
    expect(finished).toBe(false);

    doc.complete();
    await reading;
    expect(finished).toBe(true);
  });
});

interface Run {
  readonly trace: string[];
  readonly injected: [unknown, unknown][];
}

/** The runtime over a page in parts, with a fake network and a recording chunk per tag. */
function run(options: { inject?: boolean } = {}): Run {
  const trace: string[] = [];
  const injected: [unknown, unknown][] = [];
  const registry = new TestRegistry();
  installHydration({
    root: document,
    document,
    registry,
    parts: readParts,
    importDeferred: async () => ({ dom: browserDom, signal }),
    resolveChunk: (name) => name,
    ...(options.inject === true
      ? {
          inject: async (map: unknown, seed: unknown) => {
            injected.push([map, seed]);
          },
        }
      : {}),
    importModule: async (url) => {
      if (url === 'ruta') {
        return {
          default: (props: readonly unknown[], fields?: unknown) => ({
            h: () => trace.push(`h:route:${JSON.stringify(props[2])}:${JSON.stringify(fields)}`),
            u: () => {},
            r: () => {},
          }),
        };
      }
      registry.define(
        url,
        class extends HTMLElement {
          h(slice: readonly unknown[]): void {
            trace.push(`h:${url}#${this.getAttribute('data-fud-id')}:${JSON.stringify(slice)}`);
          }
        },
      );
      return undefined;
    },
  });
  return { trace, injected };
}

describe('hydration part by part (§6.18, §6.19)', () => {
  beforeEach(() => {
    publish();
  });

  it('an eager host of part 1 comes up with its marker, while part 2 has not arrived', async () => {
    const doc = loading();
    block(0, { eager: ['x-eager'] });
    end();
    const r = run();
    await settle();
    expect(r.trace).toEqual([]);

    block(1, { state: [0, [0, 1], [7]] });
    host('x-eager', 0);
    await settle();
    // Shown, but its part is not closed yet: nothing comes up.
    expect(r.trace).toEqual([]);
    end();
    await settle();
    expect(r.trace).toEqual(['h:x-eager#0:[7]']);
    expect(document.querySelector(`script[${PART_ATTR}]`)).toBeNull();
    expect(markers()).toBe(0);

    doc.complete();
    await settle();
  });

  it('a host touched once every block is gone still gets its state, from memory', async () => {
    const doc = loading();
    block(0, {});
    end();
    const r = run();
    block(1, { state: [0, [0, 1], ['tarde']] });
    const late = host('x-late', 0);
    end();
    doc.complete();
    await settle();
    expect(document.querySelector(`script[${PART_ATTR}]`)).toBeNull();
    expect(markers()).toBe(0);
    expect(r.trace).toEqual([]);

    click(late);
    await settle();
    expect(r.trace).toEqual(['h:x-late#0:["tarde"]']);
  });

  it('a host touched before its part is closed waits for it, and then gets its slice', async () => {
    const doc = loading();
    block(0, {});
    end();
    const r = run();
    block(1, { state: [0, [0, 1], ['pronto']] });
    const early = host('x-early', 0);
    click(early);
    await settle();
    expect(r.trace).toEqual([]);
    end();
    await settle();
    expect(r.trace).toEqual(['h:x-early#0:["pronto"]']);
    doc.complete();
    await settle();
  });

  it('a host whose part never comes is woken when the page finishes', async () => {
    const doc = loading();
    block(0, {});
    end();
    const r = run();
    const orphan = host('x-orphan', 3);
    click(orphan);
    await settle();
    expect(r.trace).toEqual([]);
    // Another part arrives, and its slice is still not the one this host waits for.
    block(1, { state: [0, [0, 1], ['otro']] });
    end();
    await settle();
    expect(r.trace).toEqual([]);
    doc.complete();
    await settle();
    expect(r.trace).toEqual(['h:x-orphan#3:[]']);
  });

  it('the route comes up once the last part is in, with the fields every part carried', async () => {
    const doc = loading();
    document.body.setAttribute('data-fud-id', '0');
    block(0, { route: 'ruta', eager: ['ruta'], data: { title: 't' }, state: [0, [0, 0], []] });
    end();
    const r = run();
    block(1, { fields: { users: { ok: ['ana'] } } });
    end();
    await settle();
    // Every part so far is in, but the page is not finished: the route waits.
    expect(r.trace).toEqual([]);

    block(2, { fields: { stats: { error: { status: 500, title: 'x' } } } });
    end();
    doc.complete();
    await settle();
    expect(r.trace).toEqual([
      'h:route:{"title":"t"}:{"users":{"ok":["ana"]},"stats":{"error":{"status":500,"title":"x"}}}',
    ]);
  });

  it('the container tree stands after the last part, with the whole map and every seed entry', async () => {
    const doc = loading();
    block(0, { ioc: [[0, 1]], di: { a: 1 } });
    end();
    const r = run({ inject: true });
    block(1, { ioc: [[0, 1, 2]], di: { b: 2 } });
    end();
    await settle();
    expect(r.injected).toEqual([]);
    doc.complete();
    await settle();
    expect(r.injected).toEqual([[[[0, 1, 2]], { a: 1, b: 2 }]]);
  });

  it('a container tree with no seed is stood up with none', async () => {
    block(0, { ioc: [[0, 1]] });
    end();
    const r = run({ inject: true });
    await settle();
    expect(r.injected).toEqual([[[[0, 1]], undefined]]);
  });

  it('a page that published no container tree injects nothing', async () => {
    block(0, {});
    end();
    const r = run({ inject: true });
    await settle();
    expect(r.injected).toEqual([]);
  });
});

describe('every page removes its blocks (§6.20)', () => {
  it('a page without `@await`: the blocks at the end are read into memory and taken out', () => {
    publish({ state: [[0, 1], ['A']], tree: { 'x-a': [] }, eager: ['x-a'], route: 'r', data: { n: 1 } });
    const maps = readPageMaps(document);
    expect(maps.slice(0)).toEqual(['A']);
    expect(maps.route).toBe('r');
    expect(maps.data).toEqual({ n: 1 });
    expect(document.querySelector('script[type="application/json"]')).toBeNull();
  });
});
