/**
 * What else a library can hold besides components — measured, not specified (SDD-43 §4.2's
 * method, applied to the question §7 left open about assets).
 *
 * A library is a package of `.fud` SOURCE, and a component is not the only thing a package of
 * source can hold. This builds one that also carries **a layout**, **a stylesheet a `.fud`
 * links**, **an image** named from two places, and **a plain `.js` a `@code` imports**, and
 * states what the build does with each. Everything here already worked: it is written down so
 * that it keeps working, not implemented.
 *
 * The one rule worth knowing is not about libraries at all: the `fudic:runtime` marker is only
 * honoured inside `<head>` (BUG-31 §T1 walks the head), and a layout that writes it in the
 * `<body>` ships the literal `src="fudic:runtime"` — in an app exactly as in a library.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { build } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fudic } from '../src/index.js';
import { runtimeAlias } from './helpers/alias.js';

/** The library's layout: its own head, its own asset, and the runtime marker. */
const LIB_LAYOUT = `<!DOCTYPE html>
<html>
  <head>
    <link rel="stylesheet" href="./lib.css">
    <script type="module" src="fudic:runtime"></script>
    @RenderHead()
  </head>
  <body>
    <header><img src="./logo.svg" alt=""></header>
    @RenderBody()
  </body>
</html>
`;

/** The library's component: a `.js` of its own in `@code`, and an asset in its CSS. */
const LIB_CARD = `@code {
  import { shout } from './format.js';

  const { title } = props<{ title: string }>();
}

<head>
  <style>
    .card { background: url(./logo.svg) no-repeat; border: 1px solid #ccc; }
  </style>
</head>

<ui-card>
  <template shadowrootmode="open">
    <article class="card"><h2>@shout(title)</h2><slot></slot></article>
  </template>
</ui-card>
`;

/** The app: it names the layout and the component by package, and writes neither. */
const APP_INDEX = `<link rel="layout" href="@acme/ui/_layout.fud">
<link rel="component" href="@acme/ui/ui-card.fud">

<head>
  <title>Tienda</title>
</head>

<h1>Tienda</h1>
<ui-card .title="hola">contenido</ui-card>
`;

interface OutFile {
  readonly fileName: string;
  readonly source?: string;
}

let output: OutFile[];

beforeAll(async () => {
  const ws = mkdtempSync(join(tmpdir(), 'fudic-libextra-'));
  const files: Record<string, string> = {
    'libs/ui/package.json': JSON.stringify({
      name: '@acme/ui',
      version: '1.0.0',
      type: 'module',
      files: ['src'],
      // Only the two entry points a consumer names. The `.js`, the `.css` and the `.svg` are
      // reached FROM those files, and `exports` has nothing to say about that: what resolves
      // them is a path on disk, not a specifier.
      exports: {
        './ui-card.fud': './src/ui-card.fud',
        './_layout.fud': './src/_layout.fud',
      },
    }),
    'libs/ui/fudic.json': JSON.stringify({ kind: 'lib', prefix: 'ui' }),
    'libs/ui/src/_layout.fud': LIB_LAYOUT,
    'libs/ui/src/ui-card.fud': LIB_CARD,
    'libs/ui/src/format.js': 'export const shout = (text) => String(text).toUpperCase();\n',
    'libs/ui/src/lib.css': '.lib { color: rebeccapurple; }\n',
    'libs/ui/src/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"></svg>\n',

    'apps/tienda/package.json': JSON.stringify({
      name: '@acme/tienda',
      version: '1.0.0',
      type: 'module',
      dependencies: { '@acme/ui': '*' },
    }),
    'apps/tienda/fudic.json': JSON.stringify({ kind: 'app', id: 'tienda' }),
    'apps/tienda/src/routes/index.fud': APP_INDEX,
  };
  for (const [path, contents] of Object.entries(files)) {
    const abs = join(ws, path);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, contents);
  }
  const modules = join(ws, 'node_modules', '@acme');
  mkdirSync(modules, { recursive: true });
  symlinkSync(join(ws, 'libs', 'ui'), join(modules, 'ui'), 'junction');

  const result = (await build({
    root: join(ws, 'apps', 'tienda'),
    logLevel: 'silent',
    resolve: { alias: { ...runtimeAlias } },
    plugins: [fudic()],
    build: { write: false, minify: false },
  })) as unknown as { output: OutFile[] };
  output = result.output;
}, 300000);

const html = (): string => output.find((o) => o.fileName.endsWith('index.html'))?.source ?? '';

/** The published name of the one file whose name starts like this. */
const published = (prefix: string): string =>
  output.find((o) => o.fileName.startsWith(prefix))?.fileName ?? '';

describe('a library holds a LAYOUT', () => {
  it('composes it: the layout’s own head, the route’s contribution, the route’s body', () => {
    // A `rel="layout"` href names a package the same way a component's does, and what comes
    // back is the same composition an app's own layout produces.
    expect(html()).toContain('<title>Tienda</title>');
    expect(html()).toContain('<h1>Tienda</h1>');
    expect(html()).toContain('<header>');
  });

  it('honours the runtime marker, so the app still registers its worker', () => {
    // The marker is the layout saying WHERE, and who decides what goes there is the build —
    // which is the app's build, not the library's.
    expect(html()).toMatch(/<script type="module" src="\/fudic-boot-[0-9a-f]{8}\.js">/u);
    expect(html()).not.toContain('src="fudic:runtime"');
  });
});

describe('a library holds CSS and an image', () => {
  it('publishes a stylesheet its layout links, and rewrites the href', () => {
    const css = published('assets/lib-');
    expect(css).toMatch(/^assets\/lib-[\w-]+\.css$/u);
    expect(html()).toContain(`<link rel="stylesheet" href="/${css}">`);
  });

  it('publishes the image ONCE for the two places that name it', () => {
    // `<img src>` in the layout and `url(…)` in the component's CSS are two references to one
    // file, and the registry that names a linked file is the host's — one name, one asset.
    const svg = published('assets/logo-');
    expect(svg).toMatch(/^assets\/logo-[\w-]+\.svg$/u);
    expect(output.filter((o) => o.fileName.startsWith('assets/logo-'))).toHaveLength(1);
    expect(html()).toContain(`<img src="/${svg}" alt="">`);
    expect(html()).toContain(`url(/${svg})`);
  });
});

describe('a library holds plain JS', () => {
  it('runs it on the server: the helper shaped the rendered markup', () => {
    // `import { shout } from './format.js'` resolves from the LIBRARY's directory, which is
    // where the file is, and the emitted module lives there too.
    expect(html()).toContain('<h2>HOLA</h2>');
  });

  it('and ships it to the browser as a chunk of the consumer’s bundle', () => {
    // Which is the point of publishing source: the library brings no bundle of its own, so
    // its JavaScript is chunked, hashed and served by whoever consumes it.
    expect(published('assets/format-')).toMatch(/^assets\/format-[\w-]+\.js$/u);
  });
});
