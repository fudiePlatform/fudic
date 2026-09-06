// @vitest-environment happy-dom
/**
 * The cell, end to end, over the REAL emit: a page rendered by the emitted server modules,
 * parsed into a live DOM, and hydrated by the emitted chunks through the runtime's own
 * cascade (BUG-24 §6, criteria 8–14).
 *
 * Nothing is stood in for at the seam under test. `packages/core` has the same assertions
 * against chunks written by hand — which is what let them be measured in red before any of
 * this existed — and this file is the other half: that what the COMPILER writes is what the
 * runtime can hold. Between them the only thing left is a real browser, which is what the
 * Playwright pass of SDD-17 is for.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { createCascade } from '../../../../core/src/hydrate/cascade.js';
import { createCells } from '../../../../core/src/hydrate/cells.js';
import { createChunkLoader } from '../../../../core/src/hydrate/chunks.js';
import { readPageMaps } from '../../../../core/src/hydrate/maps.js';
import {
  allInstances,
  instanceState,
  type ElementRegistry,
} from '../../../../core/src/hydrate/registry.js';
import { SsrDom, renderToString } from '@fudic/ssr';
import { browserDom } from '@fudic/dom';
import type { Controller, FudicElementCtor } from '@fudic/core';
import { resolveComponents, type ComponentGraph } from '../../../src/emit/index.js';
import { memoryIo } from '../_support.js';
import { clientFactory, serverRendersOf } from './_harness.js';

const OWNER = `<link rel="component" href="./cx-view.fud">
<link rel="component" href="./cx-form.fud">

@code {
  @client {
    import { signal } from "@fudic/core";
    const count = signal(0);
    function sumar(n) { count.set(count() + n); }
  }
}

<cx-owner>
  <template shadowrootmode="open">
    <p>@(count())</p>
    <cx-view .value=@count></cx-view>
    <cx-form .onSave=@sumar></cx-form>
  </template>
</cx-owner>
`;

const VIEW = `<link rel="component" href="./cx-kid.fud">

@code {
  const { value } = props<{ value: Signal<number> }>();
  @client {
    import { computed } from "@fudic/core";
    const doble = computed(() => value() * 2);
  }
}

<cx-view>
  <template shadowrootmode="open">
    <p>@value() @doble()</p>
    <cx-kid .value=@value></cx-kid>
  </template>
</cx-view>
`;

const KID = `@code {
  const { value } = props<{ value: Signal<number> }>();
}

<cx-kid>
  <template shadowrootmode="open">
    <p>@value()</p>
  </template>
</cx-kid>
`;

const FORM = `@code {
  const { onSave } = props<{ onSave: (n: number) => void }>();
}

<cx-form>
  <template shadowrootmode="open">
    <button @click=@onSave(5)>+5</button>
  </template>
</cx-form>
`;

/** TWO owners on the page: what a `document`-wide bus could not tell apart (§6.14). */
const graph: ComponentGraph = resolveComponents(
  '/page.fud',
  memoryIo({
    '/page.fud':
      '<!DOCTYPE html>\n<html>\n  <head><link rel="component" href="./cx-owner.fud"></head>\n' +
      '  <body><cx-owner></cx-owner><cx-owner></cx-owner></body>\n</html>\n',
    '/cx-owner.fud': OWNER,
    '/cx-view.fud': VIEW,
    '/cx-kid.fud': KID,
    '/cx-form.fud': FORM,
  }),
);

/**
 * A faithful custom-element registry: `define` upgrades every instance already in the tree,
 * in place, keeping its shadow root. happy-dom REPLACES the node instead, which would make
 * this suite measure the emulation rather than the emit — the same reason the runtime takes
 * the registry as a port (SDD-17 §4.4).
 */
class SwapRegistry implements ElementRegistry {
  readonly #ctors = new Map<string, FudicElementCtor>();

  define(name: string, ctor: FudicElementCtor): void {
    this.#ctors.set(name, ctor);
    for (const el of allInstances(document)) if (el.localName === name) this.upgrade(el);
  }
  get(name: string): CustomElementConstructor | undefined {
    return this.#ctors.get(name) as unknown as CustomElementConstructor | undefined;
  }
  whenDefined(): Promise<unknown> {
    return Promise.resolve();
  }

  /**
   * `FudicElement`'s three entry points, put on the instance.
   *
   * A prototype swap is what the platform's own `define` does to an element already in the
   * tree, but it cannot install a PRIVATE field — and `FudicElement` keeps its controller in
   * one, deliberately, so a live component has no external write surface. So the routing is
   * reproduced here instead of inherited: it is four lines, `FudicElement` has its own suite
   * for them, and what this file is about is the chunk the compiler wrote.
   */
  upgrade(node: Node): void {
    const el = node as Element & { h?: unknown; u?: (p: readonly unknown[]) => void };
    const ctor = this.#ctors.get(el.localName);
    if (ctor === undefined || el.h !== undefined) return;
    let controller: Controller | undefined;
    Object.assign(el, {
      h: (props: readonly unknown[]) => {
        controller = ctor.c([browserDom, el.shadowRoot, ...props]);
        controller.h();
      },
      u: (props: readonly unknown[]) => controller?.u(props),
    });
  }
}

/** What the HTML parser does with `<template shadowrootmode>`, one level at a time. */
function materializeShadows(root: ParentNode): void {
  for (const template of [...root.querySelectorAll('template[shadowrootmode]')]) {
    const host = template.parentElement!;
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.append((template as HTMLTemplateElement).content);
    template.remove();
    materializeShadows(shadow);
  }
}

interface Page {
  raise(tag: string): Promise<void>;
  hosts(tag: string): readonly Element[];
}

/**
 * The page the runtime reads: the two owners rendered by the emitted SERVER modules against
 * the real adapter, serialized, parsed back, and its `fud-state` published.
 *
 * The body is composed here rather than through the emitted page module, and that is only a
 * loading constraint: the page module is an ES module on disk, and a dynamic import of a temp
 * file does not resolve inside the DOM environment this suite needs. Everything that matters
 * is the real thing — the renders, the adapter, the ids, the payload. `fud-tree` is the one
 * map written by hand, and it is static: what it says is locked by `tree.test.ts`.
 */
function publish(): void {
  const renders = serverRendersOf(graph);
  const dom = new SsrDom();
  const body = dom.element('body');
  for (let i = 0; i < 2; i += 1) {
    const owner = dom.element('cx-owner');
    dom.claim(owner);
    renders.get('cx-owner')!(dom, dom.attachShadow(owner), {});
    dom.append(body, owner);
  }
  const html = renderToString(body);
  const { offsets, data } = dom.hydrationState();

  document.body.innerHTML = html.slice(html.indexOf('>') + 1, html.lastIndexOf('</body>'));
  materializeShadows(document.body);
  for (const [id, value] of [
    ['fud-state', [offsets, data]],
    ['fud-tree', { 'cx-owner': ['cx-view', 'cx-form'], 'cx-view': ['cx-kid'] }],
  ] as const) {
    const script = document.createElement('script');
    script.setAttribute('type', 'application/json');
    script.id = id;
    script.textContent = JSON.stringify(value);
    document.body.append(script);
  }
}

/** Put the page in the DOM and arm the cascade over it. */
function render(): Page {
  publish();

  const registry = new SwapRegistry();
  const maps = readPageMaps(document);
  const loader = createChunkLoader({
    registry,
    resolveChunk: (tag) => tag,
    importModule: async (tag) => {
      registry.define(tag, clientFactory(graph, tag));
    },
  });
  const cascade = createCascade({
    maps,
    cells: createCells(maps),
    loader,
    registry,
    state: instanceState(),
    root: document,
    report: () => {},
  });

  return {
    // Path 2 of SDD-17 §4.4 minus the bus, which nothing here emits on.
    async raise(tag: string): Promise<void> {
      await cascade.prepareTag(tag);
      await loader.ensureDefined(tag);
      await cascade.prepareCells(tag);
      cascade.attachAll(tag);
    },
    hosts: (tag) => allInstances(document).filter((el) => el.localName === tag),
  };
}

/**
 * What a component is showing, as one string.
 *
 * The controller is private and a component never learns its own id, so the value is read
 * where it lands — in the text it painted. Identity is not asserted by comparing objects
 * nobody exposes but by MOVING one: a single write, and everything downstream of it moves.
 */
const shown = (host: Element): string => (host.shadowRoot!.textContent ?? '').replace(/\s+/gu, ' ').trim();

describe('the cell over the real emit', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('§6.8, §6.10, §6.13 — one write from the child moves owner, view and grandchild', async () => {
    const page = render();
    await page.raise('cx-owner');

    const [owner] = page.hosts('cx-owner');
    const [view] = page.hosts('cx-view');
    const [kid] = page.hosts('cx-kid');
    expect(shown(owner!)).toBe('0');
    expect(shown(view!)).toBe('0 0');
    expect(shown(kid!)).toBe('0');

    // Through the FORM, which proves the callback and the identity at once: the child calls
    // a function of its owner, the owner writes its cell, and everything holding that one
    // object repaints — with no `u` between them.
    (page.hosts('cx-form')[0]!.shadowRoot!.querySelector('button') as HTMLElement).click();

    expect(shown(owner!)).toBe('5');
    expect(shown(view!)).toBe('5 10');
    expect(shown(kid!)).toBe('5');
  });

  it('§6.12 — the write repaints the readers and calls NO `u` on the way', async () => {
    const page = render();
    await page.raise('cx-owner');

    // Every consumer of the cell, watched at the one seam a value could still travel
    // through: `u` is the update channel of a prop that crosses by VALUE, and a cell has
    // nothing to renew — parent and child hold the same object, so a write must reach the
    // grandchild without a single hop.
    let updates = 0;
    for (const tag of ['cx-view', 'cx-kid', 'cx-form'] as const) {
      for (const host of page.hosts(tag)) {
        const el = host as Element & { u: (props: readonly unknown[]) => void };
        const original = el.u.bind(el);
        el.u = (props: readonly unknown[]): void => {
          updates += 1;
          original(props);
        };
      }
    }

    (page.hosts('cx-form')[0]!.shadowRoot!.querySelector('button') as HTMLElement).click();

    expect(shown(page.hosts('cx-view')[0]!)).toBe('5 10');
    expect(shown(page.hosts('cx-kid')[0]!)).toBe('5');
    expect(updates).toBe(0);
  });

  it('§6.9 — the grandchild first, the owner last: the same object either way', async () => {
    const page = render();
    await page.raise('cx-kid');
    await page.raise('cx-owner');

    (page.hosts('cx-form')[0]!.shadowRoot!.querySelector('button') as HTMLElement).click();
    expect(shown(page.hosts('cx-kid')[0]!)).toBe('5');
  });

  it('§6.14 — two forms with different owners call each its own', async () => {
    const page = render();
    await page.raise('cx-owner');

    const forms = page.hosts('cx-form');
    (forms[1]!.shadowRoot!.querySelector('button') as HTMLElement).click();

    const owners = page.hosts('cx-owner');
    expect(shown(owners[0]!)).toBe('0');
    expect(shown(owners[1]!)).toBe('5');
  });
});
