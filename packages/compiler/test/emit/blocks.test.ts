/**
 * The three `<script type="application/json">` blocks a page publishes (SDD-15 §3.3–§3.5),
 * read off the HTML the page really produced against the real `@fudic/ssr`.
 *
 * That last part is the whole point of this file. `script` is a rawtext element for the real
 * serializer and ordinary escaped text for a fake one, so a test that renders against a fake
 * would pass with the escaping removed — which is the one bug these blocks can have that
 * turns a payload into markup.
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import {
  resolveComponents,
  emitComponentClientModule,
  type ComponentGraph,
} from '../../src/emit/index.js';
import { fixturesDir, fixtureIo, memoryIo, pageModuleOf, ssrIo } from './_support.js';

/** Render a page and hand back its HTML plus the payload the adapter collected. */
async function render(
  graph: ComponentGraph,
  data: unknown,
): Promise<{ html: string; payload: { offsets: readonly number[]; data: readonly unknown[] } }> {
  const page = await pageModuleOf(graph);
  const { io, dom } = ssrIo();
  return { html: [...page(data, io)].join(''), payload: dom().hydrationState() };
}

/** The raw text of a block, exactly as it travels in the document. */
function blockText(html: string, id: string): string | undefined {
  const m = new RegExp(`<script type="application/json" id="${id}">(.*?)</script>`, 'su').exec(html);
  return m?.[1];
}

/** The parsed value of a block — what the runtime will hold. */
function block(html: string, id: string): unknown {
  const text = blockText(html, id);
  return text === undefined ? undefined : JSON.parse(text);
}

const HOME_DATA = {
  title: 'Inicio',
  items: [
    { id: 'a', title: 'Primero', description: 'Desc', featured: true },
    { id: 'b', title: 'Segundo', description: 'Otra', featured: false },
  ],
};

describe('the blocks of the canonical page', () => {
  const graph = resolveComponents(join(fixturesDir, 'home.fud'), fixtureIo);

  it('fud-state carries `[[offsets],[data]]`, and it is the payload of THIS render', async () => {
    const { html, payload } = await render(graph, HOME_DATA);
    expect(block(html, 'fud-state')).toEqual([payload.offsets, payload.data]);
  });

  it('fud-tree travels with it, and fud-bus does not exist for this page', async () => {
    const { html } = await render(graph, HOME_DATA);
    expect(block(html, 'fud-tree')).toEqual({ 'app-card': ['app-button'] });
    // `app-actions` emits `cleared` and listens to it in its own template: the reflexive edge
    // is dropped when composing, so the map is empty and no block is written.
    expect(blockText(html, 'fud-bus')).toBeUndefined();
  });

  it('they are the last thing in the body, after every instance is rendered', async () => {
    const { html } = await render(graph, HOME_DATA);
    const state = html.indexOf('id="fud-state"');
    expect(state).toBeGreaterThan(html.lastIndexOf('data-fud-id='));
    expect(html.indexOf('id="fud-tree"')).toBeGreaterThan(state);
    expect(html.slice(html.indexOf('id="fud-tree"'))).toContain('</body></html>');
  });
});

describe('what is empty is not published', () => {
  it('a page that claims no instance carries none of the three', async () => {
    // The catalogue HAS a hydratable component and a tree; this render just never reaches
    // one. The maps would describe a hydration with nothing to hydrate.
    const graph = resolveComponents(join(fixturesDir, 'home.fud'), fixtureIo);
    const { html, payload } = await render(graph, { title: 'x', items: [] });
    expect(payload.offsets).toEqual([0]);
    for (const id of ['fud-state', 'fud-tree', 'fud-bus']) {
      expect(blockText(html, id)).toBeUndefined();
    }
  });

  it('a flat page publishes its state and no tree', async () => {
    const graph = resolveComponents(
      '/app/home.fud',
      memoryIo({
        '/app/home.fud': `<!DOCTYPE html>
<html>
  <head><link rel="component" href="./x-tick.fud"></head>
  <body><x-tick .label="hola"></x-tick></body>
</html>
`,
        '/app/x-tick.fud': `@code {
  const { label = '' } = props<{ label?: string }>();

  @client {
    import { signal } from '@fudic/core';
    const n = signal(0);
  }
}
<x-tick>
  <template shadowrootmode="open"><p>@label @n()</p></template>
</x-tick>
`,
      }),
    );
    const { html } = await render(graph, {});
    expect(block(html, 'fud-state')).toEqual([[0, 1], ['hola']]);
    expect(blockText(html, 'fud-tree')).toBeUndefined();
    expect(blockText(html, 'fud-bus')).toBeUndefined();
  });
});

describe('a payload cannot break out of its script', () => {
  // The test that had to be written before the escape helper. `script` is rawtext: its text
  // is serialized VERBATIM, so a `</script` inside any string of the payload would close the
  // block and everything after it would be markup the browser runs.
  const HOSTILE = '</script><img src=x onerror="alert(1)">';

  const graph = resolveComponents(
    '/app/home.fud',
    memoryIo({
      '/app/home.fud': `<!DOCTYPE html>
<html>
  <head><link rel="component" href="./x-note.fud"></head>
  <body><x-note .text="@data.text"></x-note></body>
</html>
`,
      '/app/x-note.fud': `@code {
  const { text = '' } = props<{ text?: string }>();

  @client {
    import { signal } from '@fudic/core';
    const seen = signal(false);
  }
}
<x-note>
  <template shadowrootmode="open"><p>@text</p></template>
</x-note>
`,
    }),
  );

  it('the block closes exactly once, and the string comes back whole', async () => {
    const { html } = await render(graph, { text: HOSTILE });
    // Counted from where the block opens, not over the whole document: the host carries the
    // same value in an attribute, and a `</script>` inside an attribute value is text — the
    // parser is not in script data there. The block is the only place it would be markup.
    const tail = html.slice(html.indexOf('<script type="application/json"'));
    expect(tail.match(/<\/script>/gu)).toHaveLength(1);
    expect(tail).not.toContain('<img');
    expect(block(html, 'fud-state')).toEqual([[0, 1], [HOSTILE]]);
  });

  it('the escape is `\\u003c`, so the JSON is still JSON', async () => {
    const { html } = await render(graph, { text: HOSTILE });
    const text = blockText(html, 'fud-state')!;
    expect(text).not.toContain('<');
    expect(text).toContain('\\u003c/script');
  });
});

describe('the two branches meet: the slice IS what the client destructures', () => {
  const graph = resolveComponents(join(fixturesDir, 'home.fud'), fixtureIo);

  /**
   * The props a tag's client factory destructures, read off the EMITTED `.client.mjs` and
   * not off a list written by hand here — a list would drift with the emit and still pass.
   */
  function clientProps(tag: string): string[] {
    const src = emitComponentClientModule(graph, graph.components.get(tag)!);
    const decl = /let \[\$dom, \$shadow(.*?)\] = \$props;/u.exec(src)?.[1] ?? '';
    return decl
      .split(',')
      .map((p) => p.split('=')[0]!.trim())
      .filter((p) => p !== '');
  }

  it('every id in the document indexes a slice of its tag`s arity', async () => {
    const { html } = await render(graph, HOME_DATA);
    const [offsets, data] = block(html, 'fud-state') as [number[], unknown[]];
    // tag by id, in the pre-order the bytes carry.
    const tags = [...html.matchAll(/<([a-z][\w-]*-[\w-]+)[^>]*\sdata-fud-id="(\d+)"/gu)].map(
      (m) => [Number(m[2]), m[1]!] as const,
    );
    expect(tags.map(([id]) => id)).toEqual([0, 1, 2, 3]);
    for (const [id, tag] of tags) {
      const slice = data.slice(offsets[id]!, offsets[id + 1]!);
      expect(slice).toHaveLength(clientProps(tag).length);
    }
    // And the arity is real, not zero on both sides.
    expect(clientProps('app-card')).toEqual(['title', 'variant']);
    expect(clientProps('app-button')).toEqual(['variant', 'disabled']);
  });

  it('a non-hydratable tag has no id, so it indexes nothing', async () => {
    const { html } = await render(graph, HOME_DATA);
    expect(html).toContain('<app-badge data-adopt="app-badge"');
    expect(html).not.toContain('<app-badge data-fud-id');
  });
});
