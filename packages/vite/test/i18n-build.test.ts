/**
 * SDD-58 in a real `vite build`: one app in `es` and `en`, every route once per locale under its
 * prefix, each locale's graph compiled with its catalog, and `/` sending the browser to one.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { build } from 'vite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fudic } from '../src/index.js';
import { writeI18nProject } from './helpers/i18n-project.js';

interface OutFile {
  readonly type: 'chunk' | 'asset';
  readonly fileName: string;
  readonly code?: string;
  readonly source?: string | Uint8Array;
  readonly imports?: readonly string[];
}

const ABOUT = `<!DOCTYPE html>
<html>
<head>
<link rel="component" href="../components/app-price.fud">
<link rel="component" href="../components/app-counter.fud">
<script src="fudic:runtime"></script>
<title>Acerca</title>
@code {
  const enlace = () => '/contact';
}
</head>
<body>
<p>Hola mundo</p>
<nav><a href="/contact">Contacto</a> <a href="/es/about">Español</a> <a href="/doc.pdf">Documento</a></nav>
<app-price></app-price>
<app-counter></app-counter>
<p><a href=@enlace()>Otro</a></p>
</body>
</html>
`;

const POST = `<!DOCTYPE html>
<html>
<head>
<script src="fudic:runtime"></script>
<title>Blog</title>
<link rel="server" href="./[slug].fudapi">
</head>
<body>
<h1>Entrada @data.slug</h1>
</body>
</html>
`;

/** The post's server: `load` and `paths`, ssg by inference (SDD-60 §3.4). */
const POST_API = `load
  slug  str

paths
`;

/** Compiled once per locale: `locale` is the one of the page being prerendered (SDD-60 §3.11). */
const POST_SERVER = `import { locale } from '@fudic/i18n';
import { load, paths } from 'fudic:routes/blog/[slug]';

load.handle((ctx) => ({ slug: ctx.params.slug }));
paths.handle(() => (locale === 'en' ? ['a', 'b'] : ['a']));
`;

const PRICE = `@code {
  import { currency } from '@fudic/i18n';
  const euros = currency('EUR');
  const precio = 3.5;
}
<app-price>
  <template shadowrootmode="open">
    <p>Total: @(precio | euros)</p>
  </template>
</app-price>
`;

/** Hydrated: its chunk is compiled once per locale, and the page of each loads its own. */
const COUNTER = `@code {
  let n = 0;
  function mas(): void { n += 1; }
}
<app-counter>
  <template shadowrootmode="open">
    <button @click="@mas">Sumar uno</button>
  </template>
</app-counter>
`;

/** A route with a client half: its own chunk, once per locale too. */
const LIVE = `<!DOCTYPE html>
<html>
<head>
<script src="fudic:runtime"></script>
<title>Vivo</title>
@code {
  let n = 0;
  function mas(): void { n += 1; }
}
</head>
<body><button @click="@mas">Pulsar</button></body>
</html>
`;

/** A layout: one chunk per locale in the Service Worker's pass, each under its own name. */
const LAYOUT = `<!DOCTYPE html>
<html>
<head><script src="fudic:runtime"></script>@RenderHead()</head>
<body><header>Cabecera</header>@RenderBody()</body>
</html>
`;

/** Hydrated and with a pipe: its chunk imports the preset, which the worker warms with it. */
const TOTAL = `@code {
  import { currency } from '@fudic/i18n';
  import { signal } from '@fudic/core';
  const euros = currency('EUR');
  const n = signal(1);
  function mas(): void { n.set(n() + 1); }
}
<app-total>
  <template shadowrootmode="open">
    <button @click="@mas">Más</button><p>@(n() | euros)</p>
  </template>
</app-total>
`;

const HOME = `<link rel="layout" href="../layouts/_layout.fud">
<link rel="component" href="../components/app-total.fud">
<head><title>Inicio</title></head>
<app-total></app-total>
`;

const FILES = {
  'src/layouts/_layout.fud': LAYOUT,
  'src/components/app-total.fud': TOTAL,
  'src/routes/home.fud': HOME,
  'src/routes/contact.fud': '<link rel="layout" href="../layouts/_layout.fud">\n<head><title>Contacto</title></head>\n<p>Escríbenos</p>\n',
  'src/routes/live.fud': LIVE,
  'src/components/app-counter.fud': COUNTER,
  'src/routes/about.fud': ABOUT,
  'src/routes/blog/[slug].fud': POST,
  'src/routes/blog/[slug].fudapi': POST_API,
  'src/server/blog.ts': POST_SERVER,
  'src/components/app-price.fud': PRICE,
  'sw.json': JSON.stringify({ shell: [] }),
};

const EN = {
  'Hola mundo': 'Hello world',
  Contacto: 'Contact',
  'Entrada {slug}': 'Post {slug}',
  'Total: {precio}': 'Total: {precio}',
  'Sumar uno': 'Add one',
  Pulsar: 'Press',
};

/** What the build said, every level: the pipeline must say nothing about catalogs (§4.10). */
const said: string[] = [];
const logger = {
  info: (m: string) => said.push(m),
  warn: (m: string) => said.push(m),
  warnOnce: (m: string) => said.push(m),
  error: (m: string) => said.push(m),
  clearScreen: () => undefined,
  hasErrorLogged: () => false,
  hasWarned: false,
};

async function buildOf(root: string): Promise<OutFile[]> {
  const result = (await build({
    root,
    customLogger: logger,
    plugins: [fudic()],
    build: { write: false, minify: false },
  })) as unknown as { output: OutFile[] };
  return result.output;
}

const text = (output: OutFile[], fileName: string): string => {
  const file = output.find((o) => o.fileName === fileName);
  if (file === undefined) throw new Error(`no ${fileName} in ${output.map((o) => o.fileName).join(', ')}`);
  return String(file.type === 'chunk' ? file.code : file.source);
};

describe('a build with "locales": ["es", "en"]', () => {
  let output: OutFile[];
  beforeAll(async () => {
    output = await buildOf(writeI18nProject({ locales: ['es', 'en'], files: FILES, catalogs: { en: EN } }));
  }, 240000);

  it('criterion 25: one pattern per route and locale, and the manifest names them', () => {
    const manifest = JSON.parse(text(output, 'fudic-routes.json')) as { routes: { pattern: string }[] };
    expect(manifest.routes.map((r) => r.pattern).sort()).toEqual([
      '/en/about',
      '/en/blog/:slug',
      '/en/contact',
      '/en/home',
      '/en/live',
      '/es/about',
      '/es/blog/:slug',
      '/es/contact',
      '/es/home',
      '/es/live',
    ]);
  });

  it('the layout of each locale is its own Service Worker chunk, under the name the manifest gives', () => {
    const manifest = JSON.parse(text(output, 'fudic-routes.json')) as {
      build: string;
      routes: { pattern: string; deps?: string[] }[];
    };
    for (const locale of ['es', 'en']) {
      const deps = manifest.routes.find((r) => r.pattern === `/${locale}/home`)!.deps!;
      expect(deps).toContain(`${locale}-_layout`);
      for (const dep of deps) expect(output.some((o) => o.fileName === `sw/c/${dep}-${manifest.build}.js`)).toBe(true);
    }
  });

  it('the imports of a hydration chunk are filed under the name the page asks it by', () => {
    const manifest = JSON.parse(text(output, 'fudic-routes.json')) as { hydrate?: Record<string, string[]> };
    expect(Object.keys(manifest.hydrate ?? {})).toEqual(expect.arrayContaining(['es/app-total', 'en/app-total']));
    expect(Object.keys(manifest.hydrate ?? {}).filter((k) => !k.includes('/'))).toEqual([]);
  });

  it('criterion 30: a route with a client half has its chunk per locale too', () => {
    const chunk = (locale: string): string =>
      output.find((o) => o.type === 'chunk' && o.fileName.startsWith(`assets/h/${locale}/${locale}-live`))!.code!;
    expect(chunk('en')).toContain('live.fud?client&locale=en');
    expect(chunk('es')).toContain('live.fud?client&locale=es');
  });

  it('criterion 25: paths() runs once per locale, in its graph, and the prerender prefixes it', () => {
    expect(text(output, 'es/blog/a/index.html')).toContain('Entrada a');
    expect(text(output, 'en/blog/a/index.html')).toContain('Post a');
    expect(text(output, 'en/blog/b/index.html')).toContain('Post b');
    expect(output.some((o) => o.fileName === 'es/blog/b/index.html')).toBe(false);
  });

  it('criterion 26: dist/index.html sends the browser to /es/', () => {
    const index = text(output, 'index.html');
    expect(index).toContain('<meta http-equiv="refresh" content="0; url=/es/">');
    expect(index).toContain('<link rel="alternate" hreflang="x-default" href="https://example.com/">');
  });

  it('criterion 38: every prerendered page also exists without its prefix, sending the browser on', () => {
    const page = text(output, 'blog/a/index.html');
    expect(page).toContain('<meta http-equiv="refresh" content="0; url=/es/blog/a">');
    expect(page).toContain('<link rel="alternate" hreflang="en" href="https://example.com/en/blog/a">');
    expect(page).toContain('<link rel="alternate" hreflang="x-default" href="https://example.com/blog/a">');
    // `b` exists only in en: that is where its page without a prefix sends the browser.
    expect(text(output, 'blog/b/index.html')).toContain('url=/en/blog/b');
    expect(text(output, 'about/index.html')).toContain('url=/es/about');
  });

  it('criterion 27: <html lang> of each locale, written by the emit', () => {
    expect(text(output, 'en/about/index.html')).toMatch(/<html[^>]* lang="en"/u);
    expect(text(output, 'es/about/index.html')).toMatch(/<html[^>]* lang="es"/u);
  });

  it('criterion 28: the same absolute block in every version, with its own canonical', () => {
    const block = [
      '<link rel="alternate" hreflang="es" href="https://example.com/es/blog/a">',
      '<link rel="alternate" hreflang="en" href="https://example.com/en/blog/a">',
      '<link rel="alternate" hreflang="x-default" href="https://example.com/blog/a">',
    ].join('');
    for (const locale of ['es', 'en']) {
      const html = text(output, `${locale}/blog/a/index.html`);
      expect(html).toContain(`<link rel="canonical" href="https://example.com/${locale}/blog/a">${block}`);
    }
  });

  it('criterion 29: links of the page get its prefix, except the ones §4.8 leaves', () => {
    const html = text(output, 'en/about/index.html');
    expect(html).toContain('href="/en/contact"');
    expect(html).toContain('href="/es/about"');
    expect(html).toContain('href="/doc.pdf"');
  });

  it('criterion 29: a dynamic href gets the prefix too', () => {
    expect(text(output, 'en/about/index.html')).toMatch(/<a href="\/en\/contact"[^>]*>Otro<\/a>/u);
  });

  it('the text of each locale, translated or original (criterion 31)', () => {
    const en = text(output, 'en/about/index.html');
    expect(en).toContain('Hello world');
    expect(en).toContain('Contact');
    // Not in the catalog: the original text, and no diagnostic.
    expect(en).toContain('Documento');
    expect(text(output, 'es/about/index.html')).toContain('Hola mundo');
  });

  it('criterion 20: the pipe formats in the locale of the page', () => {
    expect(text(output, 'es/about/index.html')).toContain('3,50 €');
    expect(text(output, 'en/about/index.html')).toContain('€3.50');
  });

  it('criterion 30: a hydrated component has one chunk per locale, each with its text', () => {
    const chunk = (locale: string): string => {
      const found = output.filter((o) => o.type === 'chunk' && o.fileName.startsWith(`assets/h/${locale}/app-counter`));
      expect(found, output.map((o) => o.fileName).join(' ')).toHaveLength(1);
      return found[0]!.code!;
    };
    expect(chunk('en')).toContain('Add one');
    expect(chunk('en')).not.toContain('Sumar uno');
    expect(chunk('es')).toContain('Sumar uno');
  });

  it('criterion 30: the page of /en/ hydrates from en/ and never names the other locale', () => {
    const coordinators = output.filter((o) => o.type === 'chunk' && /"en\/"/u.test(o.code ?? ''));
    expect(coordinators.length).toBeGreaterThan(0);
    for (const c of coordinators) expect(c.code).not.toContain('"es/"');
  });

  it('criterion 30: an N1 component with a pipe downloads no runtime of @fudic/i18n', () => {
    // What the browser of /en/about loads: its coordinator with what it imports, and the
    // chunk of the one component it hydrates. `app-price` has a chunk too — every component
    // does — and nobody asks for it. The Service Worker does load the piece: it renders the
    // page itself, with the pipe (criterion 20).
    const html = text(output, 'en/about/index.html');
    expect(html).not.toContain('/i18n/');
    const main = /src="\/(fudic-main-[^"]+)"/u.exec(html)?.[1];
    expect(main).toBeDefined();
    const loaded = new Set<string>();
    const visit = (fileName: string): void => {
      const chunk = output.find((o) => o.fileName === fileName);
      if (chunk === undefined || loaded.has(fileName)) return;
      loaded.add(fileName);
      for (const imported of chunk.imports ?? []) visit(imported);
    };
    visit(main!);
    visit(output.find((o) => o.fileName.startsWith('assets/h/en/app-counter'))!.fileName);
    expect(loaded.size).toBeGreaterThan(1);
    for (const fileName of loaded) expect(text(output, fileName)).not.toMatch(/\/i18n\//u);
  });
});

describe('criterion 31: the pipeline reads catalogs, and nothing more', () => {
  let root: string;
  let output: OutFile[];
  const catalogs = (): string[] =>
    readdirSync(join(root, 'src', 'locales'), { recursive: true, encoding: 'utf8' })
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => `${f}:${readFileSync(join(root, 'src', 'locales', f), 'utf8')}`);
  let before: string[];
  beforeAll(async () => {
    said.length = 0;
    // An empty translation, an invalid one, one with a hole that is not the original's, and a
    // catalog for `ar` that is not JSON at all.
    root = writeI18nProject({
      locales: ['es', 'en', 'ar'],
      files: FILES,
      catalogs: { en: { 'Hola mundo': '', Contacto: 'Contact {', 'Entrada {slug}': 'Post {other}', 'Sumar uno': 'Add one' }, ar: null },
    });
    before = catalogs();
    output = await buildOf(root);
  }, 240000);

  it('the build passes and writes nothing in src/locales', () => {
    expect(output.length).toBeGreaterThan(0);
    expect(catalogs()).toEqual(before);
  });

  it('says nothing about the catalogs', () => {
    expect(said.join('\n')).not.toMatch(/FUD102[2-5]/u);
  });

  it('what is missing or invalid goes out in the original text', () => {
    const en = text(output, 'en/about/index.html');
    expect(en).toContain('Hola mundo');
    expect(en).toContain('Contacto');
    expect(text(output, 'en/blog/a/index.html')).toContain('Entrada a');
    expect(text(output, 'ar/about/index.html')).toContain('Hola mundo');
  });

  it('criterion 27: /ar/ is written right to left', () => {
    expect(text(output, 'ar/about/index.html')).toMatch(/<html[^>]* dir="rtl"/u);
    expect(text(output, 'en/about/index.html')).not.toContain('dir=');
  });
});

describe('criterion 37: a build in two or more locales needs site', () => {
  it('stops with FUD1027 when fudic.json has none', async () => {
    const root = writeI18nProject({ locales: ['es', 'en'], files: { 'src/routes/live.fud': LIVE }, site: null });
    await expect(buildOf(root)).rejects.toThrow(/FUD1027/u);
  }, 240000);
});

describe('§4.5: a single locale', () => {
  let output: OutFile[];
  beforeAll(async () => {
    output = await buildOf(writeI18nProject({ locales: ['es'], files: FILES }));
  }, 240000);

  it('has no prefix and no redirect: the routes are the ones it had', () => {
    const manifest = JSON.parse(text(output, 'fudic-routes.json')) as { routes: { pattern: string }[] };
    expect(manifest.routes.map((r) => r.pattern).sort()).toEqual(['/about', '/blog/:slug', '/contact', '/home', '/live']);
    expect(output.some((o) => o.fileName === 'index.html')).toBe(false);
    expect(output.some((o) => o.fileName.startsWith('assets/h/es/'))).toBe(false);
  });

  it('pipes and links work in its locale, unprefixed', () => {
    const html = text(output, 'about/index.html');
    expect(html).toContain('3,50 €');
    expect(html).toContain('href="/contact"');
    expect(html).toMatch(/<html[^>]* lang="es"/u);
  });
});
