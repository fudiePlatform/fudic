/**
 * The criterion that replaces `fud-chunks` (SDD-15 §3.6, retired; §6.27 rewritten).
 *
 * The map `tag → URL` is not emitted: the URL of a tag's hydration chunk is derivable from
 * `fudic-routes.json` with `createUrlResolver(base, build).hydrateUrl(tag)`, and the runtime
 * reads the tag off `host.localName` of each `[data-fud-id]`. So the guarantee that mattered
 * was never «the map is complete» — it was «the file is there», and that is what this
 * checks, from the prerendered HTML rather than from any map.
 *
 * Keeping both would be the same fact in two files that expire by different rules: the
 * manifest is purged per build, a JSON inside a prerendered HTML lives as long as that HTML
 * is cached, so a deploy would leave a page pointing at the previous build's chunks.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { build } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fudic } from '../src/index.js';
import { runtimeAlias } from './helpers/alias.js';
import { routeTable, emitted, manifestFile } from './helpers/manifest.js';
import { BUILD_TOKEN } from '../src/constants.js';

/** A component that hydrates: it declares a signal and hooks up a click. */
const COUNTER = `<link rel="component" href="./x-out.fud">

@code {
  @client {
    import { signal } from '@fudic/core';

    const n = signal(0);

    function inc() {
      n.set(n() + 1);
    }
  }
}

<x-counter>
  <template shadowrootmode="open">
    <button @click="@inc">+1</button>
    <x-out .value="@n"></x-out>
  </template>
</x-counter>
`;

/**
 * Its child: nothing of its own, but the parent crosses a reactive value to it — the
 * induced level. What crosses is a VALUE (decision 84), so the child holds a number.
 */
const OUT = `@code {
  const { value = 0 } = props<{ value?: number }>();
}

<x-out>
  <template shadowrootmode="open">
    <p>@value</p>
  </template>
</x-out>
`;

/** A component with no state at all: it must NOT get an id. */
const PLAIN = `<x-plain>
  <template shadowrootmode="open">
    <span><slot></slot></span>
  </template>
</x-plain>
`;

const PAGE = `<!DOCTYPE html>
<html>
<head>
  <link rel="component" href="../components/x-counter.fud">
  <link rel="component" href="../components/x-plain.fud">
  <title>Home</title>
</head>
<body>
  <x-counter></x-counter>
  <x-plain>inerte</x-plain>
</body>
</html>
`;

interface OutFile {
  readonly type: 'chunk' | 'asset';
  readonly fileName: string;
  readonly code?: string;
  readonly source?: unknown;
}

let output: OutFile[];

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), 'fudic-hydration-urls-'));
  mkdirSync(join(root, 'src', 'routes'), { recursive: true });
  mkdirSync(join(root, 'src', 'components'), { recursive: true });
  writeFileSync(join(root, 'src', 'components', 'x-counter.fud'), COUNTER);
  writeFileSync(join(root, 'src', 'components', 'x-out.fud'), OUT);
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
}, 120000);

/** Every tag that carries a `data-fud-id` in the prerendered HTML of the build. */
function hydratedTags(): string[] {
  const tags = new Set<string>();
  for (const file of output) {
    if (!file.fileName.endsWith('.html')) continue;
    for (const m of String(file.source).matchAll(/<([a-z][a-z0-9-]*-[a-z0-9-]+)\s[^>]*data-fud-id="\d+"/gu)) {
      tags.add(m[1]!);
    }
  }
  return [...tags].sort();
}

describe('every hydratable instance has a chunk to load, with no map', () => {
  it('the prerendered HTML marks the hydratable tags and only those', () => {
    // `x-out` has nothing of its own and is here because it receives `.value="@n"`, which is
    // the induced level; `x-plain` has neither and stays inert.
    expect(hydratedTags()).toEqual(['x-counter', 'x-out']);
    const html = String(output.find((o) => o.fileName === 'index.html')!.source);
    expect(html).toContain('<x-plain data-fud-adopt="x-plain"');
    expect(html).not.toContain('<x-plain data-fud-id');
  });

  it('hydrateUrl of each of them lands on a file the build wrote', () => {
    const table = routeTable(output);
    const tags = hydratedTags();
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) {
      expect(emitted(output, table.urls.hydrateUrl(tag))).toBe(true);
    }
  });

  it('no page publishes a fud-chunks block: the URL is derived, not shipped', () => {
    for (const file of output) {
      if (file.fileName.endsWith('.html')) expect(String(file.source)).not.toContain('fud-chunks');
    }
  });
});

/** What `fudic-main.js` imports, as file names of this build. */
function mainImports(): string[] {
  const main = output.find((o) => o.fileName === 'fudic-main.js');
  return [...String(main?.code).matchAll(/from\s*["']\.\/([^"']+)["']/gu)].map((m) => m[1]!);
}

/** The Service Worker's code — emitted as an asset, so its text may be bytes. */
function swText(): string {
  const sw = output.find((o) => o.fileName === 'fudic-sw.js');
  const source = sw?.source;
  return typeof source === 'string' ? source : new TextDecoder().decode(source as Uint8Array);
}

describe('the main-thread bootstrap, now that it hydrates (SDD-17 §4.6, §4.7.1)', () => {
  it('carries the REAL build id, and derives the same URL the manifest does', () => {
    const main = String(output.find((o) => o.fileName === 'fudic-main.js')?.code);
    // A surviving token would ask for `…-__FUDB__.js` — a file no build ever writes.
    expect(main).not.toContain(BUILD_TOKEN);
    expect(main).toContain(`createUrlResolver("/", "${manifestFile(output).build}")`);
    // And what that resolver produces is a file this build wrote (asserted above per tag).
    expect(emitted(output, routeTable(output).urls.hydrateUrl('x-counter'))).toBe(true);
  });

  it('the shell is the declared list PLUS the whole static graph of the bootstrap', () => {
    // Whether Rollup splits that graph is the app's business — it does as soon as the
    // bootstrap and a hydration chunk share a module — and a split chunk carries a HASH in
    // its name, which `sw.json` cannot state by hand. So the graph is computed, not
    // declared, and this asserts the union whatever the split turned out to be.
    const sw = swText();
    // As a quoted literal, whatever quote the emit ended up using: the list is data baked
    // into the worker, and this is what `install` will precache.
    for (const entry of ['/fudic-main.js', ...mainImports().map((i) => `/${i}`)]) {
      expect(sw).toMatch(new RegExp(`["'\`]${entry.replace(/[/.]/gu, '\\$&')}["'\`]`, 'u'));
    }
  });
});
