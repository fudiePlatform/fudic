/**
 * SDD-79 §6, criteria 6, 7, 9–11, 14–16 and 24 — the style guide in a real build of a real
 * workspace: a guide library, a component library that depends on it, and an app that depends
 * on both. What is measured is the HTML that comes out and the files published with it.
 *
 * The libraries are installed as pnpm installs them, as links under the workspace root.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { build, type Logger } from 'vite';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fudic } from '../src/index.js';
import { runtimeAlias } from './helpers/alias.js';

const manifest = (name: string, extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ name, version: '1.0.0', type: 'module', ...extra }, null, 2);

/** The library's component: it adopts the guide's `button` and `select`, and writes an `<h2>`. */
const CARD = `<ui-card>
  <template shadowrootmode="open" shadowrootadoptedstylesheets="button select">
    <button>b</button><select><option>o</option></select><h2>t</h2>
  </template>
</ui-card>
`;

/** The app's own component: it adopts `button` too, and `h2`, which it does not use. */
const PANEL = `<link rel="component" href="@acme/ui/ui-card.fud">
<app-panel>
  <template shadowrootmode="open" shadowrootadoptedstylesheets="button h2">
    <button>p</button><ui-card></ui-card>
  </template>
</app-panel>
`;

const LAYOUT = (head: string): string => `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    ${head}
    <link rel="stylesheet" href="./layout.css">
    @RenderHead()
  </head>
  <body>@RenderBody()</body>
</html>
`;

const INDEX = `<link rel="layout" href="../layouts/_layout.fud">
<link rel="component" href="../components/app-panel.fud">
<h1>Tienda</h1>
<app-panel></app-panel>
`;

const OTHER = `<link rel="layout" href="../layouts/_layout.fud">
<link rel="component" href="../components/app-panel.fud">
<p>otra</p>
<app-panel></app-panel>
`;

interface OutFile {
  readonly fileName: string;
  readonly source?: string | Uint8Array;
}

interface Built {
  readonly output: OutFile[];
  readonly error?: string;
  readonly warnings: readonly string[];
}

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

async function buildWorkspace(files: Readonly<Record<string, string>> = {}): Promise<Built> {
  const ws = mkdtempSync(join(tmpdir(), 'fudic-guide-'));
  const tree: Record<string, string> = {
    'libs/guide/package.json': manifest('@acme/guide', { files: ['*.css', 'fonts', 'icons', 'logo.svg', 'fudic.json'] }),
    'libs/guide/fudic.json': JSON.stringify({
      kind: 'lib',
      globalStyles: { base: 'base.css' },
      guide: { sheet: 'guide.css', icon: 'logo.svg' },
    }),
    'libs/guide/guide.css': ['tokens', 'document', 'base', 'h1', 'h2', 'button', 'select'].map((f) => `@import "./${f}.css";`).join('\n'),
    'libs/guide/tokens.css':
      '@font-face { font-family: "Inter"; src: url(./fonts/inter.woff2) format("woff2"); }\n' +
      ':root { --acme-font-sans: "Inter", sans-serif; --acme-ink: #111; }',
    'libs/guide/document.css': 'body { margin: 0; color: var(--acme-ink); font-family: var(--acme-font-sans); }',
    'libs/guide/base.css': '*, *::before, *::after { box-sizing: border-box; }',
    'libs/guide/h1.css': ':where(h1) { font-size: 2rem; }',
    'libs/guide/h2.css': ':where(h2) { font-size: 1.5rem; }',
    'libs/guide/button.css': ':where(button) { padding: 0; }',
    'libs/guide/select.css': ':where(select) { background: url(./icons/arrow.svg) no-repeat; }',
    'libs/guide/fonts/inter.woff2': 'wOF2-not-really',
    'libs/guide/icons/arrow.svg': '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>',
    'libs/guide/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>',

    'libs/ui/package.json': manifest('@acme/ui', {
      dependencies: { '@acme/guide': '*' },
      exports: { './ui-card.fud': './src/ui-card.fud' },
      files: ['src', '*.css', 'img'],
    }),
    'libs/ui/fudic.json': JSON.stringify({ kind: 'lib', prefix: 'ui', globalStyles: { ui: 'ui.css' } }),
    'libs/ui/ui.css': ':host { display: block; background: url(./img/dot.svg); }',
    'libs/ui/img/dot.svg': '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>',
    'libs/ui/src/ui-card.fud': CARD,

    'apps/tienda/package.json': manifest('@acme/tienda', { dependencies: { '@acme/ui': '*', '@acme/guide': '*' } }),
    'apps/tienda/fudic.json': JSON.stringify({ kind: 'app', id: 'tienda', prefix: 'app', css: 'link' }),
    'apps/tienda/src/layouts/_layout.fud': LAYOUT(''),
    'apps/tienda/src/layouts/layout.css': 'h1 { letter-spacing: 0; }',
    'apps/tienda/src/routes/index.fud': INDEX,
    'apps/tienda/src/routes/otra.fud': OTHER,
    'apps/tienda/src/components/app-panel.fud': PANEL,
    ...files,
  };
  for (const [path, contents] of Object.entries(tree)) {
    const abs = join(ws, path);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, contents);
  }
  const modules = join(ws, 'node_modules', '@acme');
  mkdirSync(modules, { recursive: true });
  symlinkSync(join(ws, 'libs', 'ui'), join(modules, 'ui'), 'junction');
  symlinkSync(join(ws, 'libs', 'guide'), join(modules, 'guide'), 'junction');

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
    return { output: [], error: error instanceof Error ? error.message : String(error), warnings };
  }
}

const text = (file: OutFile | undefined): string =>
  file?.source === undefined ? '' : typeof file.source === 'string' ? file.source : Buffer.from(file.source).toString('utf8');
const page = (built: Built, name: string): string => text(built.output.find((o) => o.fileName.endsWith(name)));
/** The published file a `href`/`url()` of the page names. */
const published = (built: Built, url: string): string => text(built.output.find((o) => url.endsWith(o.fileName)));
const linksIn = (html: string): string[] => [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/gu)].map((m) => m[1]!);

describe('a route of an app that depends on the guide (criteria 6, 7, 9, 10)', () => {
  let built: Built;
  beforeAll(async () => {
    built = await buildWorkspace();
  }, 300000);

  it('builds', () => {
    expect(built.error).toBeUndefined();
  });

  it('links the pruned copy of the guide before the layout\'s sheets, with no <link> in the source', () => {
    const html = page(built, 'index.html');
    const [guide, layout] = linksIn(html);
    expect(guide).toBeDefined();
    expect(published(built, guide!)).toContain('box-sizing');
    expect(published(built, layout!)).toContain('letter-spacing');
  });

  it('keeps h1 for a page with an <h1> in its light DOM, and drops it for one without', () => {
    expect(published(built, linksIn(page(built, 'index.html'))[0]!)).toContain('font-size:2rem');
    const other = published(built, linksIn(page(built, 'otra/index.html'))[0]!);
    expect(other).not.toContain('font-size:2rem');
    // Elements only inside components are not the page's.
    expect(other).not.toContain('font-size:1.5rem');
  });

  it('publishes the font from the library with a hash, and the copy points at it', () => {
    const guide = published(built, linksIn(page(built, 'index.html'))[0]!);
    const font = /url\("?([^")]*inter[^")]*\.woff2)"?\)/u.exec(guide)?.[1];
    expect(font).toMatch(/inter-[\w-]+\.woff2$/u);
    expect(built.output.some((o) => font!.endsWith(o.fileName))).toBe(true);
  });
});

describe('the pieces a component adopts (criteria 11, 14, 24)', () => {
  let built: Built;
  beforeAll(async () => {
    built = await buildWorkspace();
  }, 300000);

  it('adopts the guide\'s button and select from libs/ui, each a sheet of its own', () => {
    const html = page(built, 'index.html');
    // With css: "link", an adopted sheet is a <link> inside the shadow root (SDD-73).
    const card = html.slice(html.indexOf('<ui-card>'));
    expect(card).toMatch(/href="\/assets\/button-[\w-]+\.css"/u);
    expect(card).toMatch(/href="\/assets\/select-[\w-]+\.css"/u);
  });

  it('a url() of a piece and of a library\'s global sheet is published and linked (criterion 14)', () => {
    const all = built.output.map((o) => o.fileName);
    expect(all.some((f) => /arrow-[\w-]+\.svg$/u.test(f))).toBe(true);
    expect(all.some((f) => /dot-[\w-]+\.svg$/u.test(f))).toBe(true);
    expect(built.warnings.join('\n')).not.toContain('FUD0363');
  });

  it("FUD1441 once for the app's component; the library's FUD1440 is its own developer's (SDD-83 §3.3)", () => {
    const said = built.warnings.join('\n');
    // app-panel adopts h2 and writes none.
    expect(said.match(/warning FUD1441/gu)).toHaveLength(1);
    expect(said).toMatch(/app-panel\.fud:\d+:\d+ - warning FUD1441: "h2"/u);
    // ui-card writes an <h2> without adopting it, but ui-card is libs/ui's: the app does not say it.
    expect(said).not.toContain('FUD1440');
  });
});

describe('css: "inline" (criteria 6, 11)', () => {
  it('the guide is linked before the layout\'s sheet, and a piece is hoisted once however many adopt it', async () => {
    const built = await buildWorkspace({
      'apps/tienda/fudic.json': JSON.stringify({ kind: 'app', id: 'tienda', prefix: 'app', css: 'inline' }),
    });
    expect(built.error).toBeUndefined();
    const html = page(built, 'index.html');
    const [guide, layout] = linksIn(html);
    expect(published(built, guide!)).toContain('box-sizing');
    expect(published(built, layout!)).toContain('letter-spacing');
    // app-panel and ui-card both adopt button: one <style type="module"> in the head.
    expect(html.match(/specifier="button"/gu)).toHaveLength(1);
    expect(html).toContain('shadowrootadoptedstylesheets="base ui button select"');
  }, 300000);
});

describe('the favicon (criteria 15, 16)', () => {
  it('the guide\'s, published, when the layout has none', async () => {
    const built = await buildWorkspace();
    const href = /<link rel="icon" href="([^"]+)">/u.exec(page(built, 'index.html'))?.[1];
    expect(href).toMatch(/logo-[\w-]+\.svg$/u);
    expect(published(built, href!)).toContain('<circle');
  }, 300000);

  it('the author\'s, when the layout writes one', async () => {
    const built = await buildWorkspace({
      'apps/tienda/src/layouts/_layout.fud': LAYOUT('<link rel="icon" href="/mine.png">'),
    });
    const html = page(built, 'index.html');
    expect(html.match(/rel="icon"/gu)).toHaveLength(1);
    expect(html).toContain('href="/mine.png"');
  }, 300000);
});

describe('an app just created: its guide, and no component yet (§8.4)', () => {
  /** A standalone app with its guide in src/guide/, base.css in globalStyles, one page. */
  async function buildApp(extra: Readonly<Record<string, string>> = {}, config: Record<string, unknown> = {}): Promise<Built> {
    const root = mkdtempSync(join(tmpdir(), 'fudic-solo-'));
    const tree: Record<string, string> = {
      'package.json': manifest('solo'),
      'fudic.json': JSON.stringify({
        kind: 'app',
        id: 'solo',
        globalStyles: { base: 'src/guide/base.css', ...((config['globalStyles'] as object | undefined) ?? {}) },
        guide: { sheet: 'src/guide/guide.css' },
      }),
      'src/guide/guide.css': '@import "./base.css";\n@import "./h1.css";',
      'src/guide/base.css': '*, *::before, *::after { box-sizing: border-box; }',
      'src/guide/h1.css': ':where(h1) { margin: 0; }',
      'src/routes/index.fud': '<!DOCTYPE html>\n<html><head><title>t</title></head><body><h1>Home</h1></body></html>\n',
      ...extra,
    };
    for (const [path, contents] of Object.entries(tree)) {
      mkdirSync(join(root, path, '..'), { recursive: true });
      writeFileSync(join(root, path), contents);
    }
    const warnings: string[] = [];
    const result = (await build({
      root,
      logLevel: 'warn',
      customLogger: recorder(warnings),
      resolve: { alias: { ...runtimeAlias } },
      plugins: [fudic()],
      build: { write: false, minify: false },
    })) as unknown as { output: OutFile[] };
    return { output: result.output, warnings };
  }

  it('says nothing of the guide\'s base: it reaches the page through the guide', async () => {
    const built = await buildApp();
    const said = built.warnings.join('\n');
    expect(said).not.toContain('FUD0742');
    expect(said).not.toContain('FUD0852');
    expect(published(built, linksIn(page(built, 'index.html'))[0]!)).toContain('box-sizing');
  }, 300000);

  it('still says it of a sheet of its own that no guide reads', async () => {
    const built = await buildApp({ 'src/theme.css': ':host { color: red; }' }, { globalStyles: { theme: 'src/theme.css' } });
    const said = built.warnings.join('\n');
    expect(said).toContain('FUD0742');
    expect(said).toMatch(/FUD0852: fudic\.json "theme"/u);
    expect(said).not.toMatch(/FUD0852: fudic\.json "base"/u);
  }, 300000);
});

describe('two guides in the chain (criterion 9)', () => {
  it('both are linked, the library\'s first', async () => {
    const built = await buildWorkspace({
      'apps/tienda/fudic.json': JSON.stringify({
        kind: 'app',
        id: 'tienda',
        prefix: 'app',
        css: 'link',
        guide: { sheet: 'src/own.css' },
        // A sheet beside the route: its url() resolve from `./`, the route's own folder.
        globalStyles: { look: 'src/routes/look.css' },
      }),
      'apps/tienda/src/own.css': '@import "./ownh1.css";',
      'apps/tienda/src/ownh1.css': 'h1 { color: green; }',
      'apps/tienda/src/routes/look.css': ':host { background: url(./dot.svg); }',
      'apps/tienda/src/routes/dot.svg': '<svg xmlns="http://www.w3.org/2000/svg"><rect width="2" height="2"/></svg>',
    });
    expect(built.error).toBeUndefined();
    expect(built.warnings.join('\n')).not.toContain('FUD0363');
    const [lib, own] = linksIn(page(built, 'index.html'));
    expect(published(built, lib!)).toContain('box-sizing');
    expect(published(built, own!)).toContain('color:green');
  }, 300000);
});
