/**
 * BUG-40 §6.1–§6.3, §6.6 and §6.9 through a real `vite build`: the most ordinary line in
 * the web, written in a layout.
 *
 * ```html
 * <link rel="stylesheet" href="../styles/tokens.css">
 * ```
 *
 * Before this BUG the build did not finish — the emit turned it into
 * `import x from "./tokens.css"` and Rollup answered that a stylesheet has no default
 * export — and with the suffix that got past that, the page shipped a URL that named no
 * file. So what is asserted here is not that the build succeeds: it is that the string in
 * the prerendered HTML and the name of a file in the output are the same string.
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
    <link rel="stylesheet" href="../styles/tokens.css">
    @RenderHead()
  </head>
  <body><main>@RenderBody()</main></body>
</html>
`;

const INDEX = `<link rel="layout" href="../layouts/_layout.fud">
<link rel="component" href="../components/s-hero.fud">
<head><title>Inicio</title></head>
<h1>Inicio</h1>
<s-hero></s-hero>
`;

/** A second route through the SAME layout: the sheet is met twice and published once. */
const ABOUT = `<link rel="layout" href="../layouts/_layout.fud">
<head><title>Acerca</title></head>
<h1>Acerca</h1>
`;

/** A component linking an image well over the inline limit — the defect was never the CSS. */
const HERO =
  '<head><style>.h{padding:var(--gap)}</style></head>\n' +
  '<s-hero><template shadowrootmode="open"><img src="./hero.png"><slot></slot></template></s-hero>\n';

const TOKENS = ':root{--gap:8px;--brand:rebeccapurple}\n';

interface OutFile {
  readonly type: 'chunk' | 'asset';
  readonly fileName: string;
  readonly code?: string;
  readonly source?: string | Uint8Array;
}

let output: OutFile[];

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), 'fudic-linked-sheet-'));
  for (const dir of ['routes', 'layouts', 'styles', 'components']) {
    mkdirSync(join(root, 'src', dir), { recursive: true });
  }
  writeFileSync(join(root, 'src', 'routes', 'index.fud'), INDEX);
  writeFileSync(join(root, 'src', 'routes', 'about.fud'), ABOUT);
  writeFileSync(join(root, 'src', 'layouts', '_layout.fud'), LAYOUT);
  writeFileSync(join(root, 'src', 'styles', 'tokens.css'), TOKENS);
  writeFileSync(join(root, 'src', 'components', 's-hero.fud'), HERO);
  writeFileSync(join(root, 'src', 'components', 'hero.png'), Buffer.alloc(5000, 7));
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

const textOf = (file: OutFile): string => file.code ?? String(file.source);

const htmlAt = (fileName: string): string => {
  const file = output.find((o) => o.fileName === fileName);
  if (file === undefined) {
    throw new Error(`${fileName} was not emitted`);
  }
  return textOf(file);
};

/** The `href` of the document's stylesheet, as the prerendered page really carries it. */
const sheetHrefIn = (fileName: string): string => {
  const found = /<link rel="stylesheet" href="([^"]+)"/u.exec(htmlAt(fileName));
  if (found === null) {
    throw new Error(`no stylesheet link in ${fileName}`);
  }
  return found[1]!;
};

describe('vite build — a layout links a stylesheet', () => {
  it('§6.1 builds at all, and the page carries a hashed URL instead of the source path', () => {
    // The import that used to kill the build is gone: the host resolved the name, the emit
    // wrote a literal.
    expect(sheetHrefIn('index.html')).toMatch(/^\/assets\/tokens-[\w-]{8}\.css$/u);
    expect(htmlAt('index.html')).not.toContain('../styles/tokens.css');
  });

  it('§6.2 the URL the page says and the file the build wrote are the same string', () => {
    // The criterion above, looked at by its cause. The href was written by the EDGE pass,
    // which prerenders the page; the file was published by the host build. Those are two
    // bundles, and before this BUG each named it for itself.
    const href = sheetHrefIn('index.html');
    expect(output.some((o) => `/${o.fileName}` === href)).toBe(true);
  });

  it('§6.6 two routes through one layout publish one file, not two', () => {
    expect(sheetHrefIn('about/index.html')).toBe(sheetHrefIn('index.html'));
    const published = output.filter((o) => /^assets\/tokens-[\w-]{8}\.css$/u.test(o.fileName));
    expect(published).toHaveLength(1);
  });

  it('publishes the compacted bytes, through the same pass a component sheet goes through', () => {
    const href = sheetHrefIn('index.html');
    const file = output.find((o) => `/${o.fileName}` === href)!;
    expect(String(file.source)).toBe(':root{--gap:8px;--brand:rebeccapurple}');
  });

  it('§6.3 an image over the limit is not split either — the defect was never the CSS', () => {
    const url = /\/assets\/hero-[\w-]{8}\.png/u.exec(allCode(output));
    expect(url).not.toBeNull();
    expect(output.some((o) => `/${o.fileName}` === url![0])).toBe(true);
  });

  it('§6.9 the worker precaches the stylesheet, and not the image', () => {
    const sw = textOf(output.find((o) => o.fileName === 'fudic-sw.js')!);
    // Its name is the build's, so `sw.json` could not have listed it — the same argument by
    // which the shell already carries the two entries. A page served from the cache without
    // its stylesheet paints wrong, which is worse than not painting.
    expect(sw).toContain(sheetHrefIn('index.html'));
    expect(sw).not.toMatch(/\/assets\/hero-[\w-]{8}\.png/u);
  });
});
