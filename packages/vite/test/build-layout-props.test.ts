/**
 * SDD-40 §6.11 — the property that DEFINES the spec: `edge`, `sw` and `ssg` produce the same
 * `<html lang>`, compared byte for byte.
 *
 * A real `vite build` over a layout that declares `culture` and a route that resolves it from
 * what `load` brought. The three origins are then exercised for what each of them actually is:
 *
 *   `ssg`   the HTML file the build prerendered.
 *   `edge`  the edge chunk's `render(ctx)`, run in process — `load` and `layout` here.
 *   `sw`    the LINKED chunk, the one the Service Worker downloads, handed `ctx.data` and
 *           `ctx.layout` out of the generated endpoint's single response. It imports neither
 *           `load` nor `layout`: `@server` cannot reach a client bundle (BUG-09).
 *
 * If this is not green the rest does not matter.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { build } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fudic } from '../src/index.js';
import { runtimeAlias } from './helpers/alias.js';
import { manifestFile, routeTable } from './helpers/manifest.js';
import { EDGE_DIR } from '../src/constants.js';
import { safeName } from '../src/link.js';

const LAYOUT = `<!DOCTYPE html>
<html lang="@culture">
<head>
@code {
  const { culture, theme = "light" } = props<{ culture: string; theme?: string }>();
}
<title>Blog</title>
@RenderHead()
</head>
<body data-theme="@theme">
<main>@RenderBody()</main>
</body>
</html>
`;

/**
 * The route: `load` brings the post, `layout` turns it into the shell's props.
 *
 * `paths()` makes it `ssg`, so the build prerenders both slugs — and the culture of each one
 * comes out of the row, which is the case §6.16 is about.
 */
const ROUTE = `<link rel="layout" href="../_layout.fud">

@code {
@server {
const POSTS = { hola: { lang: 'es' }, hello: { lang: 'en' } };
export function paths() { return [{ slug: 'hola' }, { slug: 'hello' }]; }
export function load(ctx) { return { post: POSTS[ctx.params.slug] }; }
export function layout(ctx, data) { return { culture: data.post.lang }; }
}
}

<h1>Post</h1>
`;

interface OutFile {
  readonly type: 'chunk' | 'asset';
  readonly fileName: string;
  readonly code?: string;
  readonly source?: string | Uint8Array;
}

const textOf = (file: OutFile): string =>
  file.code ?? (typeof file.source === 'string' ? file.source : '');

interface EdgeChunk {
  render(ctx: unknown): ReadableStream<Uint8Array>;
  data(ctx: unknown): Promise<{ data: unknown; layout?: unknown }>;
}

let output: OutFile[];
let root: string;

/** Drain a byte stream into the string it carries. */
async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) out += decoder.decode(value, { stream: true });
  }
  return out + decoder.decode();
}

/** The `<html …>` opening tag of a document — the one byte-for-byte subject of §6.11. */
const htmlTagOf = (html: string): string => /<html[^>]*>/u.exec(html)?.[0] ?? '';

/** The HTML the build prerendered for one slug — the `ssg` origin, as it reaches a host. */
const prerendered = (slug: string): string =>
  readFileSync(join(root, 'dist', 'blog', slug, 'index.html'), 'utf8');

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'fudic-layout-props-'));
  mkdirSync(join(root, 'src', 'routes', 'blog'), { recursive: true });
  writeFileSync(join(root, 'src', 'routes', '_layout.fud'), LAYOUT);
  writeFileSync(join(root, 'src', 'routes', 'blog', '[slug].fud'), ROUTE);
  writeFileSync(join(root, 'sw.json'), JSON.stringify({ shell: [] }));
  // A project with a Service Worker has to say who it is: its caches are named after it.
  writeFileSync(join(root, 'fudic.json'), JSON.stringify({ id: 'test' }));
  const result = (await build({
    root,
    logLevel: 'silent',
    resolve: { alias: { ...runtimeAlias } },
    plugins: [fudic()],
    // WRITTEN to disk: the edge chunks live outside `outDir` and only exist when they do,
    // and this suite has to run one.
    build: { minify: false },
  })) as unknown as { output: OutFile[] };
  output = result.output;
}, 180000);

/** Import the built edge chunk of a pattern — the module the preview and prerender run. */
async function edgeChunk(pattern: string): Promise<EdgeChunk> {
  const file = join(root, EDGE_DIR, `${safeName(pattern)}.js`);
  return (await import(pathToFileURL(file).href)) as unknown as EdgeChunk;
}

const ctxFor = (slug: string, origin: string, extra: Record<string, unknown> = {}): unknown => ({
  origin,
  url: new URL(`http://localhost/blog/${slug}`),
  params: { slug },
  mode: 'ssg',
  nonce: '',
  ...extra,
});

describe('SDD-40 §6.15–§6.16 — the layout gets its props, per route and per param', () => {
  it('prerenders each slug with the culture its own row carried', () => {
    expect(htmlTagOf(prerendered('hola'))).toBe('<html lang="es">');
    expect(htmlTagOf(prerendered('hello'))).toBe('<html lang="en">');
  });

  it('uses the default for a prop the route resolved nothing for', () => {
    expect(prerendered('hola')).toContain('<body data-theme="light">');
  });

  it('keeps `@server` out of every published file, resolver included (BUG-09)', () => {
    for (const file of output) {
      expect(textOf(file)).not.toContain('data.post.lang');
    }
  });

  it('gives the route a data endpoint, because it resolves something for the render', () => {
    const record = manifestFile(output).routes.find((r) => r.pattern === '/blog/:slug');
    expect(record?.dataPolicy).toBeDefined();
    expect(routeTable(output).urls.dataUrl('/blog/:slug')).toBe('/_fudic/data/blog/:slug');
  });
});

describe('SDD-40 §6.10 — the endpoint answers with both halves, in ONE response', () => {
  it('returns `{ data, layout }`', async () => {
    const chunk = await edgeChunk('/blog/:slug');
    const answer = await chunk.data(ctxFor('hola', 'edge'));
    expect(answer).toEqual({ data: { post: { lang: 'es' } }, layout: { culture: 'es' } });
  });

  it('resolves the layout props FROM what load returned (§6.8)', async () => {
    const chunk = await edgeChunk('/blog/:slug');
    const answer = await chunk.data(ctxFor('hello', 'edge'));
    // `en` is nowhere in the URL or the params: it came out of the row `load` fetched.
    expect(answer.layout).toEqual({ culture: 'en' });
  });
});

describe('SDD-40 §6.11 — edge, sw and ssg produce the SAME <html lang>', () => {
  it('compares the three, byte for byte', async () => {
    const chunk = await edgeChunk('/blog/:slug');

    // ssg: what the build wrote.
    const ssg = htmlTagOf(prerendered('hello'));

    // edge: `load` and `layout` in process.
    const edge = htmlTagOf(await drain(chunk.render(ctxFor('hello', 'edge'))));

    // sw: the LINKED chunk, handed both halves by the endpoint. It never runs `@server`.
    const resolved = await chunk.data(ctxFor('hello', 'edge'));
    const linked = await linkedChunk();
    const sw = htmlTagOf(
      await drain(
        linked.render(
          ctxFor('hello', 'sw', { data: resolved.data, layout: resolved.layout }),
        ),
      ),
    );

    expect(edge).toBe(ssg);
    expect(sw).toBe(ssg);
    expect(ssg).toBe('<html lang="en">');
  });
});

/**
 * The Service Worker's own chunk, evaluated the way the Service Worker evaluates it.
 *
 * It is the CommonJS-shaped module `@fudic/transport`'s linker loads, with `@fudic/ssr` as a
 * builtin of that loader — so `exports` and a `require` that answers with the real package is
 * the whole environment it needs. Its URL is DERIVED from the manifest, not spelled: that is
 * the derivation the SW itself performs, and asserting through it is what proves the build
 * wrote the file the worker will ask for.
 */
async function linkedChunk(): Promise<{ render(ctx: unknown): ReadableStream<Uint8Array> }> {
  const table = routeTable(output);
  const record = manifestFile(output).routes.find((r) => r.pattern === '/blog/:slug')!;
  const file = join(root, 'dist', table.urls.renderUrl(record)!.replace(/^\//u, ''));
  const code = readFileSync(file, 'utf8');
  // It must NOT carry the server half: that is BUG-09, and it is also why it needs `ctx`.
  expect(code).not.toContain('?server');
  expect(code).not.toContain('data.post.lang');
  const ssr = await import('@fudic/ssr');
  const exports: Record<string, unknown> = {};
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function('exports', 'require', code)(exports, () => ssr);
  return exports as unknown as { render(ctx: unknown): ReadableStream<Uint8Array> };
}
