/**
 * SDD-73 §3.5 — `css: "link"` in a real `vite build` and `vite dev`.
 *
 * - Criterion 7: the page carries neither the polyfill nor a `<style type="module">`; each host
 *   with sheets wears `data-fud-sheets` and its template ends with its `<link>`s.
 * - Criterion 8: the files are published by the build, two pages with the same sheet share one,
 *   and the dev server serves the same bytes.
 * - Criterion 9: the route's hints carry its components' sheets, behind its head's.
 * - Criterion 16: the `<style>` of a route's head is a file too.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build, createServer, type ViteDevServer } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type AddressInfo } from 'node:net';
import { fudic } from '../src/index.js';
import { runtimeAlias, writeTypecheckConfig } from './helpers/alias.js';
import { manifestFile } from './helpers/manifest.js';
import type { ManifestFile } from '@fudic/transport';

const CARD = `<head><style>:host { display: block } .in { color: red }</style></head>
<x-card>
  <template shadowrootmode="open"><b class="in">c</b></template>
</x-card>
`;

/** A component that hydrates and CHOOSES a project sheet by name: three files in front. */
const COUNTER = `@code {
  import { signal } from '@fudic/core';

  const n = signal(0);

  function inc() {
    n.set(n() + 1);
  }
}

<head><style>button { margin: 0 }</style></head>
<x-counter>
  <template shadowrootmode="open" shadowrootadoptedstylesheets="panel">
    <button @click="@inc">@n()</button>
  </template>
</x-counter>
`;

const page = (title: string): string => `<!DOCTYPE html>
<html>
<head>
  <link rel="component" href="../components/x-card.fud">
  <title>${title}</title>
  <style>p.a { margin: 0 } .nadie { x: 1 }</style>
</head>
<body><p class="a">texto</p><x-card></x-card></body>
</html>
`;

interface OutFile {
  readonly type: 'chunk' | 'asset';
  readonly fileName: string;
  readonly source?: string | Uint8Array;
}

function project(): string {
  const root = mkdtempSync(join(tmpdir(), 'fudic-css-link-'));
  writeTypecheckConfig(root);
  for (const dir of ['src/routes', 'src/components', 'src/styles']) mkdirSync(join(root, dir), { recursive: true });
  writeFileSync(join(root, 'src/components/x-card.fud'), CARD);
  writeFileSync(join(root, 'src/components/x-counter.fud'), COUNTER);
  writeFileSync(join(root, 'src/styles/theme.css'), ':host { color: blue }\n');
  writeFileSync(join(root, 'src/styles/panel.css'), ':host { padding: 1px }\n');
  writeFileSync(join(root, 'src/routes/index.fud'), page('Uno'));
  writeFileSync(join(root, 'src/routes/otra.fud'), page('Otra'));
  writeFileSync(
    join(root, 'src/routes/cuenta.fud'),
    page('Cuenta').replace('x-card.fud', 'x-counter.fud').replace('<x-card></x-card>', '<x-counter></x-counter>'),
  );
  writeFileSync(
    join(root, 'fudic.json'),
    JSON.stringify({
      id: 'link',
      globalStyles: { theme: 'src/styles/theme.css' },
      styles: { panel: 'src/styles/panel.css' },
      css: 'link',
    }),
  );
  return root;
}

const text = (source: string | Uint8Array | undefined): string =>
  typeof source === 'string' ? source : new TextDecoder().decode(source);

/** The files `<x-card>`'s template opens with, in order. */
const sheetsOf = (html: string): string[] => {
  const template = /<x-card[^>]*><template shadowrootmode="open">((?:<link [^>]+>)*)/u.exec(html)![1]!;
  return [...template.matchAll(/href="([^"]+)"/gu)].map((m) => m[1]!);
};

describe('`css: "link"` in a build (criteria 7, 8, 9, 16)', () => {
  let output: OutFile[];
  let manifest: ManifestFile;
  const asset = (url: string): string => text(output.find((f) => `/${f.fileName}` === url)!.source);

  beforeAll(async () => {
    const result = (await build({
      root: project(),
      logLevel: 'silent',
      resolve: { alias: { ...runtimeAlias } },
      plugins: [fudic({ sw: false })],
      build: { write: false, minify: false },
    })) as unknown as { output: OutFile[] };
    output = result.output;
    manifest = manifestFile(result.output);
  }, 120_000);

  const htmlOf = (fileName: string): string => text(output.find((f) => f.fileName === fileName)!.source);

  it('criterion 7: no polyfill, no style module, no marker; the template opens with its `<link>`s', () => {
    const html = htmlOf('index.html');
    expect(html).not.toContain('type="module" specifier');
    expect(html).not.toContain('shadowrootadoptedstylesheets');
    expect(html).not.toContain('data-fud-adopt');
    expect(html).not.toContain('data-fud-sheets');
    const sheets = sheetsOf(html);
    expect(sheets).toHaveLength(2);
    expect(sheets[0]).toMatch(/^\/assets\/theme-[\w-]+\.css$/u);
    expect(sheets[1]).toMatch(/^\/assets\/x-card-[\w-]+\.css$/u);
    expect(html).toContain(`${sheets.map((s) => `<link rel="stylesheet" href="${s}">`).join('')}<b class="in">c</b></template>`);
  });

  it('criterion 8: the files are published, and two pages with the same sheet share it', () => {
    const one = sheetsOf(htmlOf('index.html'));
    expect(sheetsOf(htmlOf('otra/index.html'))).toEqual(one);
    const [theme, card] = one as [string, string];
    expect(asset(theme)).toBe(':host{color:blue}');
    expect(asset(card)).toBe(':host{display:block}.in{color:red}');
  });

  it('criterion 10: the chunk of a component steps over exactly the `<link>`s its server root opens with', () => {
    const html = htmlOf('cuenta/index.html');
    const links = /<x-counter[^>]*><template shadowrootmode="open">((?:<link [^>]+>)*)/u.exec(html)![1]!;
    // Its project's guide, the sheet it chooses by name, and its own.
    expect(links.match(/<link /gu)).toHaveLength(3);
    const chunk = output.find((f) => f.type === 'chunk' && /x-counter/u.test(f.fileName))!;
    const code = (chunk as { code?: string }).code!;
    const first = /= ((?:\$dom\.nextElementSibling\()*)\$dom\.firstElementChild\(\$shadow\)/u.exec(code)!;
    expect(first[1]!.match(/nextElementSibling/gu)).toHaveLength(3);
  });

  it('criterion 16: the `<style>` of the head is a `<link>` to its pruned file, in its place', () => {
    const html = htmlOf('index.html');
    expect(html).not.toContain('<style');
    const own = /<title>Uno<\/title><link rel="stylesheet" href="(\/assets\/index-[\w-]+\.css)">/u.exec(html)![1]!;
    expect(asset(own)).toBe('p.a{margin:0}');
  });

  it('criterion 9: the hints carry the head’s file, then the components’, before the modules', () => {
    const hints = manifest.routes.find((r) => r.pattern === '/')!.hints!;
    // The content hash is the last eight characters before `.css`.
    expect(hints.slice(0, 3).map((h) => h.replace(/-[\w-]{8}\.css>/u, '.css>'))).toEqual([
      '</assets/index.css>; rel=preload; as=style',
      '</assets/theme.css>; rel=preload; as=style',
      '</assets/x-card.css>; rel=preload; as=style',
    ]);
  });
});

describe('`css: "link"` in dev (criterion 8)', () => {
  let server: ViteDevServer;
  let origin: string;

  beforeAll(async () => {
    server = await createServer({
      root: project(),
      logLevel: 'silent',
      resolve: { alias: { ...runtimeAlias } },
      plugins: [fudic({ liveCheck: false, sw: false })],
      server: { port: 0 },
    });
    await server.listen();
    origin = `http://localhost:${(server.httpServer!.address() as AddressInfo).port}`;
  }, 120_000);

  afterAll(async () => {
    await server.close();
  });

  it('serves each file the page names, with the bytes the build publishes', async () => {
    const html = await (await fetch(`${origin}/`, { headers: { accept: 'text/html' } })).text();
    const [theme, card] = sheetsOf(html) as [string, string];
    const themeRes = await fetch(`${origin}${theme}`);
    expect(themeRes.headers.get('content-type')).toContain('text/css');
    expect(await themeRes.text()).toBe(':host{color:blue}');
    expect(await (await fetch(`${origin}${card}`)).text()).toBe(':host{display:block}.in{color:red}');
  });
});
