/**
 * `fud-state` — the payload the page collects while it renders (SDD-15 §3.3, §4.1;
 * criteria §6.1, §6.2, §6.5, §6.6).
 *
 * The shape is `[[offsets],[data]]`: the `data-fud-id` IS the index into `offsets`, so
 * there is no intermediate table, no keys and no per-tag index. Everything here is read off
 * a page that really rendered, against the real `@fudic/ssr` adapter — the payload is a
 * fact about a render, not about a string the emit wrote.
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { resolveComponents, type ComponentGraph } from '../../src/emit/index.js';
import { fixturesDir, fixtureIo, memoryIo, pageModuleOf, ssrIo } from './_support.js';

interface Payload {
  readonly offsets: readonly number[];
  readonly data: readonly unknown[];
}

/** Render a page and hand back its HTML together with the payload it collected. */
async function render(graph: ComponentGraph, data: unknown): Promise<{ html: string; payload: Payload }> {
  const page = await pageModuleOf(graph);
  const { io, dom } = ssrIo();
  const html = [...page(data, io)].join('');
  return { html, payload: dom().hydrationState() };
}

/** Every `data-fud-id` of a document, in the order the bytes carry them. */
const idsOf = (html: string): number[] =>
  [...html.matchAll(/data-fud-id="(\d+)"/gu)].map((m) => Number(m[1]));

const HOME_DATA = {
  title: 'Inicio',
  items: [
    { id: 'a', title: 'Primero', description: 'Desc', featured: true },
    { id: 'b', title: 'Segundo', description: 'Otra', featured: false },
  ],
};

describe('fud-state — the payload of the canonical page', () => {
  const graph = resolveComponents(join(fixturesDir, 'home.fud'), fixtureIo);

  it('offsets are contiguous and complete, and the id is the index (§6.1, §6.2)', async () => {
    const { html, payload } = await render(graph, HOME_DATA);
    const { offsets, data } = payload;
    const n = offsets.length - 1;
    expect(offsets[0]).toBe(0);
    expect(offsets[n]).toBe(data.length);
    for (let i = 0; i < n; i += 1) expect(offsets[i + 1]!).toBeGreaterThanOrEqual(offsets[i]!);
    // Two cards, each with one button inside its shadow: four instances, four slices.
    expect(idsOf(html)).toEqual([0, 1, 2, 3]);
    expect(n).toBe(4);
  });

  it('each slice is the child`s own props, in the order the child declared them', async () => {
    const { payload } = await render(graph, HOME_DATA);
    const slice = (id: number): unknown[] =>
      payload.data.slice(payload.offsets[id]!, payload.offsets[id + 1]!);
    // app-card declares `{ title, variant = 'default' }`; app-button `{ variant, disabled }`.
    expect(slice(0)).toEqual(['Primero', 'highlight']);
    expect(slice(1)).toEqual(['ghost', false]);
    expect(slice(2)).toEqual(['Segundo', 'default']);
    expect(slice(3)).toEqual(['ghost', false]);
  });

  it('the defaults are already applied: an omitted prop is not a null', async () => {
    // `.variant` is written by the page for every card here, so take the one the CHILD
    // omits: `app-card` writes no `.disabled` on its `app-button`, and the slice carries
    // `false` — the child's default — rather than the `null` JSON would give a hole.
    const { payload } = await render(graph, HOME_DATA);
    expect(payload.data).not.toContain(null);
    expect(payload.data[3]).toBe(false);
  });

  it('a non-hydratable child has no id and no slice (§6.26)', async () => {
    const { html, payload } = await render(graph, HOME_DATA);
    expect(html).toContain('<app-badge data-fud-adopt="app-badge"');
    expect(html).not.toContain('<app-badge data-fud-id');
    // Four slices for four claimed hosts; the badge is not one of them.
    expect(payload.offsets.length - 1).toBe(4);
  });
});

describe('fud-state — the state is complete, not the projection', () => {
  // The invariant an `@if` breaks without saying so. It comes out free of task 6 — the
  // slice is read off the destructured locals, not off what got painted — and that is
  // exactly why it needs a test: a property held by construction is one a refactor can
  // lose in silence.
  const graph = resolveComponents(
    '/app/home.fud',
    memoryIo({
      '/app/home.fud': `<!DOCTYPE html>
<html>
  <head><link rel="component" href="./x-contact.fud"></head>
  <body><x-contact .name="Ada" .phone="555" .byPhone="@false"></x-contact></body>
</html>
`,
      '/app/x-contact.fud': `@code {
  const { name = '', phone = '', byPhone = false } = props<{ name?: string; phone?: string; byPhone?: boolean }>();

  @client {
    import { signal } from '@fudic/core';
    const open = signal(false);
  }
}
<x-contact>
  <template shadowrootmode="open">
    @if (byPhone) {
      <span class="phone">@phone</span>
    } else {
      <span class="name">@name</span>
    }
  </template>
</x-contact>
`,
    }),
  );

  it('a component that paints one of two fields still carries both', async () => {
    const { html, payload } = await render(graph, {});
    expect(html).toContain('class="name"');
    expect(html).not.toContain('class="phone"');
    // The DOM shows the projection; the payload is the preimage.
    expect(payload).toEqual({ offsets: [0, 3], data: ['Ada', '555', false] });
  });
});

describe('fud-state — determinism (§6.6)', () => {
  const graph = resolveComponents(join(fixturesDir, 'home.fud'), fixtureIo);

  it('the same tree and the same data render byte for byte the same', async () => {
    const first = await render(graph, HOME_DATA);
    const second = await render(graph, HOME_DATA);
    expect(second.html).toBe(first.html);
    expect(second.payload).toEqual(first.payload);
  });

  it('altering the composition tree keeps ids and payload mutually consistent', async () => {
    // No reconciliation step: the ids come out of the same pass that fills the slices, so
    // a different tree gives a different — and still square — pair.
    const one = await render(graph, { title: 'x', items: [HOME_DATA.items[0]] });
    const three = await render(graph, {
      title: 'x',
      items: [...HOME_DATA.items, { id: 'c', title: 'Tercero', description: 'D', featured: false }],
    });
    expect(idsOf(one.html)).toEqual([0, 1]);
    expect(one.payload.offsets).toEqual([0, 2, 4]);
    expect(idsOf(three.html)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(three.payload.offsets).toEqual([0, 2, 4, 6, 8, 10, 12]);
    expect(three.payload.data.slice(8, 10)).toEqual(['Tercero', 'default']);
  });

  it('an empty branch of the page claims nothing at all', async () => {
    const { html, payload } = await render(graph, { title: 'x', items: [] });
    expect(html).toContain('No hay elementos todavía.');
    expect(idsOf(html)).toEqual([]);
    expect(payload).toEqual({ offsets: [0], data: [] });
  });
});
