/**
 * SDD-49 criteria 30, 36, 37 and 39 through a real `vite build`: every page gets a copy of
 * the sheets it links with only the rules it can use, named by the hash of those bytes.
 *
 * What is asserted is what only a whole build can show: that the three passes (host, Service
 * Worker, edge) compiling the same `.fud` write the same URL; that two pages keeping the same
 * rules share one file; that the copies stay out of the install; and that what the build
 * learns about a sheet — page by page — is said once, at the end, about the sheet.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { build, type Rollup } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fudic } from '../src/index.js';
import { runtimeAlias } from './helpers/alias.js';

interface OutFile {
  readonly type: 'chunk' | 'asset';
  readonly fileName: string;
  readonly code?: string;
  readonly source?: string | Uint8Array;
}

interface Built {
  readonly root: string;
  readonly output: readonly OutFile[];
  readonly warnings: readonly string[];
}

/** A project on disk with these files (paths relative to its root), built without writing. */
async function buildProject(files: Readonly<Record<string, string>>): Promise<Built> {
  const root = mkdtempSync(join(tmpdir(), 'fudic-prune-'));
  for (const [path, text] of Object.entries(files)) {
    const abs = join(root, path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, text);
  }
  const warnings: string[] = [];
  const result = (await build({
    root,
    logLevel: 'silent',
    resolve: { alias: { ...runtimeAlias } },
    plugins: [fudic()],
    build: {
      write: false,
      minify: false,
      rollupOptions: { onwarn: (w: Rollup.RollupLog) => warnings.push(w.message) },
    },
  })) as unknown as { output: OutFile[] };
  return { root, output: result.output, warnings };
}

const textOf = (file: OutFile): string => file.code ?? String(file.source);

/** Every occurrence of `needle` in `text`. */
const count = (text: string, needle: string): number => text.split(needle).length - 1;

const LAYOUT = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <link rel="stylesheet" href="../styles/main.css">
    <link rel="stylesheet" href="../styles/dead.css">
    @RenderHead()
  </head>
  <body><main>@RenderBody()</main></body>
</html>
`;

/** A route through the layout whose markup uses `cls`. */
const route = (title: string, cls: string): string =>
  `<link rel="layout" href="../layouts/_layout.fud">
<link rel="component" href="../components/s-box.fud">
<head><title>${title}</title></head>
<p class="${cls}">${title}</p>
<s-box></s-box>
`;

/** Chooses `panel`, and its template has nothing `panel.css` can match. */
const BOX =
  '<s-box><template shadowrootmode="open" shadowrootadoptedstylesheets="panel"><span><slot></slot></span></template></s-box>\n';

/**
 * The sheet the layout links: an external `@import` the build cannot flatten (`FUD0850`, a
 * warning about the sheet itself), a relative one no page uses, and three rules.
 */
const MAIN =
  '@import url("https://cdn.example.test/reset.css");\n' +
  '@import "./inputs.css";\n' +
  '.a { color: red; }\n' +
  '.b { color: blue; }\n' +
  '.never { color: green; }\n';

const FILES: Readonly<Record<string, string>> = {
  'src/layouts/_layout.fud': LAYOUT,
  // Two pages keep the same rules, a third keeps others.
  'src/routes/index.fud': route('Inicio', 'a'),
  'src/routes/about.fud': route('Acerca', 'a'),
  'src/routes/contact.fud': route('Contacto', 'b'),
  'src/components/s-box.fud': BOX,
  'src/styles/main.css': MAIN,
  // Every input of this application is inside a component: nobody's page has one.
  'src/styles/inputs.css': 'input { border: 0; }\n',
  // Linked by the layout of every page, and matched by none.
  'src/styles/dead.css': '.ghost { color: red; }\n',
  'src/styles/panel.css': '.panel { padding: 0; }\n',
  'fudic.json': JSON.stringify({ id: 'test', styles: { panel: 'src/styles/panel.css' } }),
  // A resource class over `assets/`: what caches a page's copy the first time it is asked for.
  'sw.json': JSON.stringify({
    shell: [],
    resources: { assets: { pattern: '/assets/**', policy: 'cache-first' } },
  }),
};

let built: Built;

beforeAll(async () => {
  built = await buildProject(FILES);
}, 300000);

const htmlAt = (fileName: string): string => {
  const file = built.output.find((o) => o.fileName === fileName);
  if (file === undefined) throw new Error(`${fileName} was not emitted`);
  return textOf(file);
};

/** The `href`s of the stylesheets a prerendered page links. */
const sheetHrefsIn = (fileName: string): string[] =>
  [...htmlAt(fileName).matchAll(/<link rel="stylesheet" href="([^"]+)"/gu)].map((m) => m[1]!);

/** The one stylesheet a page links (the dead sheet is not written at all). */
const sheetHrefIn = (fileName: string): string => {
  const hrefs = sheetHrefsIn(fileName);
  expect(hrefs).toHaveLength(1);
  return hrefs[0]!;
};

const fileAt = (url: string): OutFile | undefined =>
  built.output.find((o) => `/${o.fileName}` === url);

describe('vite build — one pruned copy per distinct prune (criterion 36)', () => {
  it('two pages that keep the same rules point to the same file', () => {
    const index = sheetHrefIn('index.html');
    expect(index).toMatch(/^\/assets\/main-[\w-]{8}\.css$/u);
    expect(sheetHrefIn('about/index.html')).toBe(index);
  });

  it('a third that keeps others points to another', () => {
    const contact = sheetHrefIn('contact/index.html');
    expect(contact).toMatch(/^\/assets\/main-[\w-]{8}\.css$/u);
    expect(contact).not.toBe(sheetHrefIn('index.html'));
  });

  it('each copy carries only the rules its page uses', () => {
    const shared = textOf(fileAt(sheetHrefIn('index.html'))!);
    expect(shared).toContain('.a{color:red;}');
    expect(shared).not.toContain('.b{');
    expect(shared).not.toContain('.never');
    // Flattened in and pruned away: the import that named it is gone too.
    expect(shared).not.toContain('inputs.css');
    expect(shared).not.toContain('input{');
    const contact = textOf(fileAt(sheetHrefIn('contact/index.html'))!);
    expect(contact).toContain('.b{color:blue;}');
    expect(contact).not.toContain('.a{');
  });

  it('publishes each copy once, and nothing else of the sheet', () => {
    for (const url of [sheetHrefIn('index.html'), sheetHrefIn('contact/index.html')]) {
      expect(built.output.filter((o) => `/${o.fileName}` === url)).toHaveLength(1);
    }
    // Two prunes, two files: not one per page, and not the whole sheet beside them.
    expect(built.output.filter((o) => /^assets\/main-[\w-]{8}\.css$/u.test(o.fileName))).toHaveLength(2);
    // A sheet that ends empty on every page is not published, and no page links it.
    expect(built.output.some((o) => o.fileName.startsWith('assets/dead-'))).toBe(false);
  });

  it('the host, the SW pass and the edge write the same URL', () => {
    const url = sheetHrefIn('index.html');
    // The edge pass prerendered the page; the host published the file under that same name.
    expect(fileAt(url)).toBeDefined();
    // The SW pass compiled the same route into the render code the worker runs: it holds the
    // URL as a constant, the very string the prerendered page carries.
    const swRender = built.output.filter(
      (o) => o.fileName.endsWith('.js') && o.fileName !== 'fudic-sw.js' && textOf(o).includes(url),
    );
    expect(swRender.length).toBeGreaterThan(0);
    // And no pass invented a name of its own for the same prune.
    const named = new Set(
      built.output
        .filter((o) => o.fileName.endsWith('.js') || o.fileName.endsWith('.html'))
        .flatMap((o) => [...textOf(o).matchAll(/\/assets\/main-[\w-]{8}\.css/gu)].map((m) => m[0])),
    );
    expect([...named].sort()).toEqual(
      [sheetHrefIn('index.html'), sheetHrefIn('contact/index.html')].sort(),
    );
  });
});

describe('vite build — the copies are not precached (criterion 37, corrected)', () => {
  it('no pruned copy is in the worker’s shell', () => {
    const sw = textOf(built.output.find((o) => o.fileName === 'fudic-sw.js')!);
    const shell = /(?:const|var) SHELL = (\[[^\n]*\]);/u.exec(sw);
    expect(shell).not.toBeNull();
    const precached = JSON.parse(shell![1]!) as string[];
    expect(precached.length).toBeGreaterThan(0);
    for (const url of [sheetHrefIn('index.html'), sheetHrefIn('contact/index.html')]) {
      expect(precached).not.toContain(url);
      expect(sw).not.toContain(url);
    }
  });

  it('they are left to the resource class that covers assets/', () => {
    const sw = textOf(built.output.find((o) => o.fileName === 'fudic-sw.js')!);
    // The worker carries the class the author wrote; each copy's URL falls under it, so it
    // is cached on the first request its page makes, as an image is.
    expect(sw).toMatch(/RESOURCES = \[\{[^\]]*"\/assets\/\*\*"[^\]]*"cache-first"/u);
    for (const url of [sheetHrefIn('index.html'), sheetHrefIn('contact/index.html')]) {
      expect(url.startsWith('/assets/')).toBe(true);
    }
  });
});

describe('vite build — what nobody uses, and what a sheet says about itself (criterion 39)', () => {
  const unused = (): string[] => built.warnings.filter((w) => w.includes('FUD0852'));

  it('FUD0852 on a linked sheet that no page keeps a rule of', () => {
    // Named by its absolute path, as the platform writes it: the file the author deletes.
    const dead = join(built.root, 'src', 'styles', 'dead.css');
    expect(unused().filter((w) => w.includes(dead))).toHaveLength(1);
  });

  it('FUD0852 on a file a sheet imports that no page keeps a rule of', () => {
    const inputs = join(built.root, 'src', 'styles', 'inputs.css');
    expect(unused().filter((w) => w.includes(inputs))).toHaveLength(1);
  });

  it('FUD0852 on the fudic.json entry of a project sheet nothing matches', () => {
    expect(unused().filter((w) => w.includes('fudic.json "panel"'))).toHaveLength(1);
  });

  it('not on the sheet some page uses', () => {
    const main = join(built.root, 'src', 'styles', 'main.css');
    expect(unused().some((w) => w.includes(main))).toBe(false);
    expect(unused()).toHaveLength(3);
  });

  it('a sheet’s own diagnostics are said once, though three pages link it', () => {
    const external = built.warnings.filter((w) => w.includes('FUD0850'));
    expect(external).toHaveLength(1);
    // At the line and column the author can click, in the file that wrote it.
    expect(external[0]).toMatch(/main\.css:1:1 - warning FUD0850: /u);
  });
});

describe('vite build — @import errors', () => {
  it('FUD0853: an @import of a file that is not there fails the build, at its line', async () => {
    const files = {
      ...FILES,
      'src/styles/main.css': '.a { color: red; }\n',
      'src/styles/dead.css': '@import "./missing.css";\n.a { color: blue; }\n',
    };
    await expect(buildProject(files)).rejects.toThrow(/dead\.css:1:1 - error FUD0853: /u);
  }, 300000);

  it('FUD0854: an @import in a fudic.json sheet fails the build, once for the sheet (criterion 30)', async () => {
    const files = {
      ...FILES,
      'src/styles/panel.css': '@import "./extra.css";\n.panel { padding: 0; }\n',
      'src/styles/extra.css': '.x { margin: 0; }\n',
    };
    const failure = await buildProject(files).then(
      () => '',
      (e: unknown) => String(e),
    );
    expect(failure).toMatch(/FUD0854/u);
    // Once for the sheet, not once per page that adopts it.
    expect(count(failure, 'error FUD0854:')).toBe(1);
    expect(failure).toContain('src/styles/panel.css:1:1 - error FUD0854: ');
  }, 300000);
});
