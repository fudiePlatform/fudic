/**
 * The hard criterion of the page maps (SDD-15 §3.2): for one route and one set of data, the
 * HTML the BUILD prerenders and the HTML the SERVICE WORKER renders carry the same
 * `data-fud-id`s and the same three JSON blocks.
 *
 * It is worth a test of its own because the two arrive by different roads. The prerender runs
 * the edge wrapper in process, with `@server load` resolved locally; the Service Worker links
 * a CJS chunk by hand with `new Function` and passes the data it fetched from the generated
 * endpoint. Two roads, one `page(data, io)` — and if the ids or the offsets diverge, then
 * there are two passes where §3.2 says there is exactly one, and every payload slice a client
 * reads is indexed by an id that means something else.
 *
 * So both roads are actually travelled here: a real `vite build`, and the emitted chunks
 * linked and run exactly as the worker does.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { build } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLinker, NONCE_TOKEN, type ModuleExports } from '@fudic/transport';
import * as ssr from '@fudic/ssr';
import { fudic } from '../src/index.js';
import { runtimeAlias } from './helpers/alias.js';
import { manifestFile, routeTable } from './helpers/manifest.js';

/** The leaf: props of its own and a signal, so it is hydratable and its slice is not empty. */
const ROW = `@code {
  const { label = '', n = 0 } = props<{ label?: string; n?: number }>();

  @client {
    import { signal } from '@fudic/core';
    const open = signal(false);
    function toggle() { open.set(!open()); }
  }
}

<x-row>
  <template shadowrootmode="open">
    <button @click="@toggle">@label</button>
    <span>@n</span>
  </template>
</x-row>
`;

/** The parent: it emits on the bus and its SHADOW holds the rows, which is what `fud-tree` maps. */
const LIST = `<link rel="component" href="./x-row.fud">

@code {
  type Item = { label: string; n: number };

  const { items = [] } = props<{ items?: Item[] }>();

  @client {
    import { emit } from '@fudic/dom';
    function pick() { emit('picked', 1); }
  }
}

<x-list>
  <template shadowrootmode="open">
    <button @click="@pick">pick</button>
    @foreach (const item of items) key (item.label) {
      <x-row .label="@item.label" .n="@item.n"></x-row>
    }
  </template>
</x-list>
`;

/** The other end of the bus: it listens for what the list emits. */
const TOAST = `@code {
  @client {
    import { signal } from '@fudic/core';
    const last = signal('');
    function onPicked(ev) { last.set(String(ev.type)); }
  }
}

<x-toast>
  <template shadowrootmode="open">
    <p bus:picked="@onPicked($event)">@last()</p>
  </template>
</x-toast>
`;

/** Nothing of its own and nothing crossing into it: it must stay inert. */
const PLAIN = `<x-plain>
  <template shadowrootmode="open"><span><slot></slot></span></template>
</x-plain>
`;

/**
 * The data the route serves. Declared here as well as in the page because that is precisely
 * the Service Worker's position: it never runs `load`, it receives the resolved data.
 */
const ITEMS = [
  { label: 'uno', n: 1 },
  { label: 'dos', n: 2 },
];

/**
 * `strategy({ mode: 'ssg' })` on a page that HAS `load` is what puts one route on both roads
 * at once: the build prerenders it (running `load`) and the worker links it (receiving the
 * data). Without the declaration the inference would send a route with `load` to `sw` and
 * there would be no prerendered HTML to compare against.
 */
const PAGE = `<!DOCTYPE html>
<html>
<head>
  <link rel="component" href="../components/x-list.fud">
  <link rel="component" href="../components/x-toast.fud">
  <link rel="component" href="../components/x-plain.fud">

  @code {
    @server {
      import { strategy } from "@fudic/core";

      strategy({ mode: "ssg" });

      export function load() {
        return { items: ${JSON.stringify(ITEMS)} };
      }
    }
  }

  <title>Maps</title>
</head>
<body>
  <x-list .items="@data.items"></x-list>
  <x-toast></x-toast>
  <x-plain>inerte</x-plain>
</body>
</html>
`;

interface OutFile {
  readonly type: 'chunk' | 'asset';
  readonly fileName: string;
  readonly code?: string;
  readonly source?: string | Uint8Array;
}

let output: OutFile[];
let prerendered: string;
let linked: string;

/** Every id the document carries, in the order the bytes carry them. */
function idsOf(html: string): number[] {
  return [...html.matchAll(/\sdata-fud-id="(\d+)"/gu)].map((m) => Number(m[1]));
}

/** The raw text of one block, exactly as it travels. */
function blockText(html: string, id: string): string | undefined {
  return new RegExp(`<script type="application/json" id="${id}">(.*?)</script>`, 'su').exec(html)?.[1];
}

const block = (html: string, id: string): unknown => {
  const text = blockText(html, id);
  return text === undefined ? undefined : JSON.parse(text);
};

/**
 * Render the route the way the Service Worker does: link the entry chunk over its deps, in
 * the topological order the manifest states, with `@fudic/ssr` injected as a builtin because
 * it is bundled inside the worker and never downloaded twice.
 */
async function renderThroughLinker(): Promise<string> {
  const table = routeTable(output);
  const record = manifestFile(output).routes.find((r) => r.pattern === '/')!;
  const codeOf = new Map<string, string>(
    output.map((o) => [`/${o.fileName}`, o.code ?? String(o.source ?? '')] as const),
  );
  const linker = createLinker({
    fetchSource: (url: string) => Promise.resolve(codeOf.get(url) ?? ''),
    builtins: { '@fudic/ssr': ssr as unknown as ModuleExports },
  });
  const exports = await linker.link(
    table.urls.renderUrl(record)!,
    (record.deps ?? []).map((name) => table.urls.depUrl(name)),
  );
  const render = exports['render'] as (ctx: unknown) => ReadableStream<Uint8Array>;
  // The nonce placeholder, as the prerender uses: whoever serves the document swaps it.
  return new Response(render({ nonce: NONCE_TOKEN, data: { items: ITEMS } })).text();
}

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), 'fudic-page-maps-'));
  mkdirSync(join(root, 'src', 'routes'), { recursive: true });
  mkdirSync(join(root, 'src', 'components'), { recursive: true });
  writeFileSync(join(root, 'src', 'components', 'x-row.fud'), ROW);
  writeFileSync(join(root, 'src', 'components', 'x-list.fud'), LIST);
  writeFileSync(join(root, 'src', 'components', 'x-toast.fud'), TOAST);
  writeFileSync(join(root, 'src', 'components', 'x-plain.fud'), PLAIN);
  writeFileSync(join(root, 'src', 'routes', 'index.fud'), PAGE);
  writeFileSync(join(root, 'sw.json'), JSON.stringify({ shell: ['/fudic-main.js'] }));
  const result = (await build({
    root,
    logLevel: 'silent',
    resolve: { alias: { ...runtimeAlias } },
    plugins: [fudic()],
    build: { write: false, minify: false },
  })) as unknown as { output: OutFile[] };
  output = result.output;
  prerendered = String(output.find((o) => o.fileName === 'index.html')!.source);
  linked = await renderThroughLinker();
}, 240000);

describe('the build writes the three blocks into the prerendered HTML', () => {
  it('publishes fud-state, fud-tree and fud-bus, in that order and last in the body', () => {
    const state = prerendered.indexOf('id="fud-state"');
    expect(state).toBeGreaterThan(prerendered.lastIndexOf('data-fud-id='));
    expect(prerendered.indexOf('id="fud-tree"')).toBeGreaterThan(state);
    expect(prerendered.indexOf('id="fud-bus"')).toBeGreaterThan(
      prerendered.indexOf('id="fud-tree"'),
    );
  });

  it('the ids are correlative in pre-order, and only hydratable hosts carry one', () => {
    // `x-list` first, then the two `x-row` its shadow holds, then `x-toast`. `x-plain` has
    // nothing of its own and nothing crossing into it.
    expect(idsOf(prerendered)).toEqual([0, 1, 2, 3]);
    expect(prerendered).toContain('<x-plain data-fud-adopt="x-plain"');
    expect(prerendered).not.toContain('<x-plain data-fud-id');
  });

  it('the slices are indexed by id, and the offsets close on the data', () => {
    const [offsets, data] = block(prerendered, 'fud-state') as [number[], unknown[]];
    expect(offsets).toHaveLength(idsOf(prerendered).length + 1);
    expect(offsets[0]).toBe(0);
    expect(offsets.at(-1)).toBe(data.length);
    // The parent holds its one prop; each row holds the two it was rendered with.
    expect(data.slice(offsets[0]!, offsets[1]!)).toEqual([ITEMS]);
    expect(data.slice(offsets[1]!, offsets[2]!)).toEqual(['uno', 1]);
    expect(data.slice(offsets[2]!, offsets[3]!)).toEqual(['dos', 2]);
  });

  it('the two static maps are the composition, not the instances', () => {
    // The rows are two in the document and one entry here: the map is tag→tags.
    expect(block(prerendered, 'fud-tree')).toEqual({ 'x-list': ['x-row'] });
    // Who emits depends on who listens; the name of the event never travels.
    expect(block(prerendered, 'fud-bus')).toEqual({ 'x-list': ['x-toast'] });
  });
});

describe('the Service Worker renders the same page, id for id', () => {
  it('links the route chunk and renders it', () => {
    // Not a shape check: the chunk was evaluated with `new Function` over its deps.
    expect(linked).toContain('<x-list');
    expect(linked).toContain('<x-toast');
  });

  it('SDD-15 §3.2 same route, same data, same ids and same three blocks', () => {
    expect(idsOf(linked)).toEqual(idsOf(prerendered));
    for (const id of ['fud-state', 'fud-tree', 'fud-bus']) {
      expect(blockText(linked, id), id).toBe(blockText(prerendered, id));
    }
  });

  it('and the whole document is the same bytes: one pass, two roads', () => {
    // The strongest form of the criterion. It holds because both roads run the SAME `page`
    // with the same data and the same nonce placeholder — anything that made the ids depend
    // on WHO renders would show up here first.
    expect(linked).toBe(prerendered);
  });
});
