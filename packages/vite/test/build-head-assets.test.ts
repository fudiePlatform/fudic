/**
 * What a `<head>` may link, and what comes out of it — over a real `vite build`.
 *
 * This is the case nobody had exercised. The only linked asset the example had was a
 * three-hundred-byte logo, which travelled as a `data:` URI and therefore said the same
 * thing in every pass, so neither of the two things asserted here had ever been looked at:
 *
 * - **An image is a file.** Nothing a document links is inlined any more, at any size. A
 *   favicon repeated in full inside every page of a site is not a saving, it is the same
 *   bytes shipped once per page and cacheable by nobody — and base64 is a third bigger
 *   than what it carries.
 * - **A `<script src>` is not an asset.** An asset is a file the browser fetches as it is;
 *   a `.js` is a module somebody compiles. Publishing one as an asset would copy the source
 *   into the output and point the page at it, which is exactly what a misplaced
 *   `<link rel="component">` was doing with a `.fud`.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { build } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fudic } from '../src/index.js';
import { runtimeAlias } from './helpers/alias.js';
import { allCode } from './helpers/output.js';

const LAYOUT = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <link rel="icon" href="../styles/favicon.svg">
    @RenderHead()
  </head>
  <body><main>@RenderBody()</main></body>
</html>
`;

/** A route whose own head links an image and a script. */
const ROUTE = `<link rel="layout" href="../layouts/_layout.fud">
<link rel="component" href="../components/s-hero.fud">
<head>
  <title>Inicio</title>
  <link rel="icon" sizes="32x32" href="../styles/small.png">
  <script src="./analytics.js"></script>
</head>
<s-hero></s-hero>
`;

/**
 * A component that links two images from inside its shadow template: the same one the
 * route's head links, and one of its own. The pair is what separates the two rules.
 */
const HERO =
  '<head><style>.h{padding:var(--gap)}</style></head>\n' +
  '<s-hero><template shadowrootmode="open">' +
  '<img src="../styles/small.png"><img src="../styles/hero.png"><slot></slot>' +
  '</template></s-hero>\n';

/** Well under the old 4096-byte threshold: this is the shape that used to become base64. */
const FAVICON = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="8" height="8"/></svg>';

interface OutFile {
  readonly type: 'chunk' | 'asset';
  readonly fileName: string;
  readonly code?: string;
  readonly source?: string | Uint8Array;
}

let output: OutFile[];

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), 'fudic-head-assets-'));
  for (const dir of ['routes', 'layouts', 'styles', 'components']) {
    mkdirSync(join(root, 'src', dir), { recursive: true });
  }
  writeFileSync(join(root, 'src', 'routes', 'index.fud'), ROUTE);
  writeFileSync(join(root, 'src', 'routes', 'analytics.js'), 'console.log("hi");\n');
  writeFileSync(join(root, 'src', 'layouts', '_layout.fud'), LAYOUT);
  writeFileSync(join(root, 'src', 'styles', 'favicon.svg'), FAVICON);
  writeFileSync(join(root, 'src', 'styles', 'small.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 9]));
  writeFileSync(join(root, 'src', 'styles', 'hero.png'), Buffer.alloc(5000, 7));
  writeFileSync(join(root, 'src', 'components', 's-hero.fud'), HERO);
  writeFileSync(join(root, 'sw.json'), JSON.stringify({ shell: [] }));
  writeFileSync(join(root, 'fudic.json'), JSON.stringify({ id: 'test' }));
  const result = (await build({
    root,
    logLevel: 'silent',
    resolve: { alias: { ...runtimeAlias } },
    plugins: [fudic()],
    build: { write: false, minify: false },
  })) as unknown as { output: OutFile[] };
  output = result.output;
}, 180000);

const html = (): string => String(output.find((o) => o.fileName === 'index.html')!.source);

/**
 * The worker's code. Through BOTH fields on purpose: it is emitted as an ASSET, so reading
 * only `.code` yields the string "undefined" — and `expect(that).not.toContain(…)` passes
 * for every input there is. A green that measures nothing.
 */
const swCode = (): string => {
  const sw = output.find((o) => o.fileName === 'fudic-sw.js')!;
  const text = sw.code ?? String(sw.source);
  expect(text.length).toBeGreaterThan(100);
  return text;
};

const published = (url: string): boolean => output.some((o) => `/${o.fileName}` === url);

describe('vite build — what a <head> links', () => {
  it('publishes the favicon as a file: no base64 in the document, at any size', () => {
    const found = /rel="icon" href="([^"]+)"/u.exec(html());
    expect(found![1]).toMatch(/^\/assets\/favicon-[\w-]{8}\.svg$/u);
    expect(published(found![1]!)).toBe(true);
  });

  it('does the same for the image the ROUTE head links, tiny as it is', () => {
    const found = /rel="icon" sizes="32x32" href="([^"]+)"/u.exec(html());
    expect(found![1]).toMatch(/^\/assets\/small-[\w-]{8}\.png$/u);
    expect(published(found![1]!)).toBe(true);
  });

  it('and for the one a COMPONENT links inside its shadow template', () => {
    // The same file from a third place. One name, one published file — the whole point.
    const url = /\/assets\/small-[\w-]{8}\.png/u.exec(allCode(output))![0];
    expect(published(url)).toBe(true);
    expect(output.filter((o) => /^assets\/small-/u.test(o.fileName))).toHaveLength(1);
  });

  it('leaves a <script src> alone: a module is not an asset, and never a data: URI', () => {
    expect(html()).toContain('<script src="./analytics.js">');
    expect(output.some((o) => /^assets\/analytics-/u.test(o.fileName))).toBe(false);
  });

  it('precaches what the head links, so the SECOND load already works offline', () => {
    // Measured in the browser, and it took three loads instead of two: the install
    // precached the stylesheet and not the icon, the icon was left to a `cache-first`
    // runtime rule, and a cache-first rule caches on the first request that reaches the
    // WORKER — which is the second load. Only the third owed nothing to the network.
    const sw = swCode();
    const icon = /rel="icon" href="([^"]+)"/u.exec(html())![1]!;
    const routeIcon = /rel="icon" sizes="32x32" href="([^"]+)"/u.exec(html())![1]!;

    expect(sw).toContain(icon);
    expect(sw).toContain(routeIcon);
  });

  it('leaves what only a component references to the runtime cache', () => {
    // The line is the document against its content. A photograph inside a component is not
    // the shell, and putting every linked byte in the install is how a first visit pays for
    // a page nobody opened. It is still published and still cached — by the `/assets/**`
    // rule, on first use.
    const hero = /\/assets\/hero-[\w-]{8}\.png/u.exec(allCode(output))![0];
    expect(published(hero)).toBe(true);
    expect(swCode()).not.toContain(hero);
  });

  it('writes no data: URI anywhere in the document', () => {
    // The favicon was the one that made this obvious: three hundred bytes, once per page,
    // in every page of the site, forever.
    expect(html()).not.toContain('data:');
  });
});
