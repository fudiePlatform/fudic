/**
 * SDD-43 §4.5 and §4.6 end to end — the shared tag space and the chain of style guides, in a
 * real build of a real workspace.
 *
 * The shape is the one that motivated the whole SDD: a guide library, a component library that
 * consumes it, and an app that consumes both. What is measured is what comes out in the HTML —
 * which sheets each component adopts — and what the build refuses to do: two files under one
 * tag, and a route chunk that would be written to a name a library already owns.
 *
 * The libraries are installed as pnpm installs them, as symlinks: their files live under the
 * workspace root and the app reaches them through `node_modules`.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { build, type Logger } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fudic } from '../src/index.js';
import { runtimeAlias } from './helpers/alias.js';

/** The library's component, with a sheet of its own and a token from the guide. */
const CARD = `<head>
  <style>
    .card { border: 1px solid var(--acme-accent); }
  </style>
</head>

<ui-card>
  <template shadowrootmode="open">
    <article class="card"><slot></slot></article>
  </template>
</ui-card>
`;

/** The app's own component, which composes the library's. */
const PANEL = `<link rel="component" href="@acme/ui/ui-card.fud">

<head>
  <style>
    .panel { display: grid; }
  </style>
</head>

<app-panel>
  <template shadowrootmode="open">
    <div class="panel"><ui-card>inner</ui-card></div>
  </template>
</app-panel>
`;

const INDEX = `<!DOCTYPE html>
<html>
  <head>
    <link rel="component" href="@acme/ui/ui-card.fud">
    <link rel="component" href="../components/app-panel.fud">
    <title>Tienda</title>
  </head>
  <body>
    <ui-card>hola</ui-card>
    <app-panel></app-panel>
  </body>
</html>
`;

const manifest = (name: string, extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ name, version: '1.0.0', type: 'module', ...extra }, null, 2);

interface OutFile {
  readonly fileName: string;
  readonly source?: string;
}

interface Built {
  readonly output?: OutFile[];
  readonly error?: string;
  readonly warnings: readonly string[];
}

/** A logger that keeps every warning, so a warning can be a test subject. */
function recorder(warnings: string[]): Logger {
  const noop = (): void => {};
  return {
    info: noop,
    warn: (message: string) => warnings.push(message),
    warnOnce: (message: string) => warnings.push(message),
    error: noop,
    clearScreen: noop,
    hasErrorLogged: () => false,
    hasWarned: false,
  };
}

/**
 * A workspace with a guide library, a component library and an app, built.
 *
 * `files` adds to or replaces anything in it — which is how the two refusals below are set up
 * without a second builder.
 */
async function buildWorkspace(files: Readonly<Record<string, string>> = {}): Promise<Built> {
  const ws = mkdtempSync(join(tmpdir(), 'fudic-libgraph-'));
  const tree: Record<string, string> = {
    'libs/guia/package.json': manifest('@acme/guia', { files: ['*.css'] }),
    'libs/guia/fudic.json': JSON.stringify({ kind: 'lib', styles: ['tokens.css'] }, null, 2),
    'libs/guia/tokens.css': ':host { --acme-accent: #c00; }',

    'libs/ui/package.json': manifest('@acme/ui', {
      dependencies: { '@acme/guia': '*' },
      // The grammar the library was written for (§4.7). Deliberately impossible, so the
      // warning is observable in the same build as everything else.
      peerDependencies: { '@fudic/compiler': '^99.0.0' },
      exports: { './ui-card.fud': './src/ui-card.fud' },
      files: ['src', '*.css'],
    }),
    'libs/ui/fudic.json': JSON.stringify({ kind: 'lib', prefix: 'ui', styles: ['ui.css'] }, null, 2),
    'libs/ui/ui.css': ':host { display: block; }',
    'libs/ui/src/ui-card.fud': CARD,

    // What `checkPeers` reads: the compiler this project resolves. The plugin imports its own
    // copy; this is the one the AUTHOR installed, and it is the version a library's range is
    // about.
    'node_modules/@fudic/compiler/package.json': manifest('@fudic/compiler'),

    'apps/tienda/package.json': manifest('@acme/tienda', {
      dependencies: { '@acme/ui': '*' },
    }),
    'apps/tienda/fudic.json': JSON.stringify(
      { kind: 'app', id: 'tienda', prefix: 'app', styles: ['tienda.css'] },
      null,
      2,
    ),
    'apps/tienda/tienda.css': ':host { margin: 0; }',
    'apps/tienda/src/routes/index.fud': INDEX,
    'apps/tienda/src/components/app-panel.fud': PANEL,
    ...files,
  };
  for (const [path, contents] of Object.entries(tree)) {
    const abs = join(ws, path);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, contents);
  }

  // Installed as pnpm installs a workspace member: a link at the root, which every package
  // under it reaches by walking up.
  const modules = join(ws, 'node_modules', '@acme');
  mkdirSync(modules, { recursive: true });
  symlinkSync(join(ws, 'libs', 'ui'), join(modules, 'ui'), 'junction');
  symlinkSync(join(ws, 'libs', 'guia'), join(modules, 'guia'), 'junction');

  const warnings: string[] = [];
  try {
    const result = (await build({
      root: join(ws, 'apps', 'tienda'),
      logLevel: 'warn',
      customLogger: recorder(warnings),
      resolve: { alias: { ...runtimeAlias } },
      plugins: [fudic()],
      build: { write: false, minify: false },
    })) as unknown as { output: OutFile[] };
    return { output: result.output, warnings };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), warnings };
  }
}

const html = (built: Built): string =>
  built.output?.find((o) => o.fileName.endsWith('index.html'))?.source ?? '';

describe('a guide library under a component library under an app (§4.6)', () => {
  let built: Built;

  beforeAll(async () => {
    built = await buildWorkspace();
  }, 300000);

  it('builds, and composes the library component', () => {
    expect(built.error).toBeUndefined();
    expect(html(built)).toContain('hola');
  });

  it('gives the LIBRARY component the guides of its own chain, and not the app’s', () => {
    // `guia → ui`, and the app's sheet is absent because the app does not define `ui-card`.
    expect(html(built)).toContain('shadowrootadoptedstylesheets="_tokens _ui ui-card"');
  });

  it('gives the APP’s component the whole chain, its own project last', () => {
    expect(html(built)).toContain('shadowrootadoptedstylesheets="_tokens _ui _tienda app-panel"');
  });

  it('hoists the three sheets, the guide first', () => {
    const out = html(built);
    const at = (specifier: string): number => out.indexOf(`specifier="${specifier}"`);
    expect(at('_tokens')).toBeGreaterThan(-1);
    expect(at('_tokens')).toBeLessThan(at('_ui'));
    expect(at('_ui')).toBeLessThan(at('_tienda'));
    // And the library's own token reaches the component's sheet, which is what retheming is.
    expect(out).toContain('var(--acme-accent)');
  });

  it('warns once that the library was written for another compiler (FUD0762)', () => {
    const peers = built.warnings.filter((w) => w.includes('FUD0762'));
    expect(peers).toHaveLength(1);
    expect(peers[0]).toContain('@acme/ui');
    expect(peers[0]).toContain('^99.0.0');
  });
});

describe('the tag space, now that it is shared (§4.5)', () => {
  it('refuses two files under one tag (FUD0761), naming both', async () => {
    const built = await buildWorkspace({
      // The app defines `ui-card` too, and the page links both.
      'apps/tienda/src/components/ui-card.fud':
        '<ui-card><template shadowrootmode="open"><p>mine</p></template></ui-card>\n',
      'apps/tienda/src/routes/index.fud': INDEX.replace(
        '<link rel="component" href="../components/app-panel.fud">',
        '<link rel="component" href="../components/ui-card.fud">',
      ).replace('<app-panel></app-panel>', ''),
    });
    expect(built.error ?? '').toMatch(/FUD0761/u);
    expect(built.error ?? '').toMatch(/ui-card/u);
  }, 300000);

  it('refuses a route chunk that would be named after a library tag (FUD0622)', async () => {
    // `safeName('/ui/card')` is `ui-card`, which the library owns. The check was always
    // against the graph, and a library component is in the graph like any other — what this
    // proves is that being in another package changes nothing about it.
    const built = await buildWorkspace({
      'apps/tienda/src/routes/ui/card.fud': [
        '<!DOCTYPE html><html><head>',
        '<link rel="component" href="@acme/ui/ui-card.fud">',
        '@code { @client { import { signal } from "@fudic/core"; const n = signal(1); } }',
        '</head><body><ui-card></ui-card><output>@n()</output></body></html>',
      ].join('\n'),
    });
    expect(built.error ?? '').toMatch(/FUD0622/u);
  }, 300000);
});
