/**
 * SDD-58 served: the dev server and `vite preview` over one app in `es` and `en`. `/` sends the
 * browser to its language (criterion 26), the data endpoint answers under the prefixed pattern
 * (criterion 25), `_error.fud` speaks the language of the page that failed (§4.5), and in dev a
 * saved catalog is seen without a restart (criterion 34).
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { build, createServer, preview, type PreviewServer, type ViteDevServer } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { fudic } from '../src/index.js';
import { writeI18nProject } from './helpers/i18n-project.js';

const ABOUT = `<!DOCTYPE html>
<html>
<head>
<link rel="component" href="../components/app-counter.fud">
<script src="fudic:runtime"></script>
<title>Acerca</title>
</head>
<body><p>Hola mundo</p><app-counter></app-counter></body>
</html>
`;

const POST = `<!DOCTYPE html>
<html>
<head>
<title>Blog</title>
@code {
@server {
export function load(ctx: { params: { slug: string } }) { return { slug: ctx.params.slug }; }
}
}
</head>
<body><h1>Entrada @data.slug</h1></body>
</html>
`;

const MISSING = `<!DOCTYPE html>
<html>
<head>
<title>x</title>
@code {
  @server {
    import { notFound } from '@fudic/http';
    export async function load(): Promise<{ n: number }> {
      throw notFound('no está');
    }
  }
}
</head>
<body><p>@data.n</p></body>
</html>
`;

const ERROR_PAGE = `<!DOCTYPE html>
<html>
<head><title>Error</title>
@code {
  const problem = data as { status: number; title: string };
}
</head>
<body><h1>Error @problem.status</h1></body>
</html>
`;

const COUNTER = `@code {
  @client {
    let n = 0;
    function mas(): void { n += 1; }
  }
}
<app-counter>
  <template shadowrootmode="open">
    <button @click="@mas">Sumar uno</button>
  </template>
</app-counter>
`;

const FILES = {
  'src/components/app-counter.fud': COUNTER,
  'src/routes/about.fud': ABOUT,
  'src/routes/blog/[slug].fud': POST,
  'src/routes/missing.fud': MISSING,
  'src/routes/_error.fud': ERROR_PAGE,
};

const EN = { 'Hola mundo': 'Hello world', 'Error {status}': 'Failure {status}', 'Sumar uno': 'Add one' };

const html = (origin: string, path: string, headers: Record<string, string> = {}): Promise<Response> =>
  fetch(`${origin}${path}`, { headers: { accept: 'text/html', ...headers }, redirect: 'manual' });

/** The checks dev and preview share: they answer the same requests the same way. */
function servesLocales(name: string, origin: () => string): void {
  describe(`${name}: criterion 26, \`/\``, () => {
    it('302 to the locale of Accept-Language that fits', async () => {
      const res = await html(origin(), '/', { 'accept-language': 'en-GB,en;q=0.9' });
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('/en/');
    });

    it('302 to the first locale with no header', async () => {
      const res = await html(origin(), '/');
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('/es/');
      expect(res.headers.get('vary')).toContain('Accept-Language');
    });
  });

  describe(`${name}: criterion 38, a page without its prefix`, () => {
    it('302 to the same page in the language that fits, varying by Accept-Language', async () => {
      const res = await html(origin(), '/blog/hola', { 'accept-language': 'en-GB,en;q=0.9' });
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('/en/blog/hola');
      expect(res.headers.get('vary')).toContain('Accept-Language');
      expect((await html(origin(), '/about')).headers.get('location')).toBe('/es/about');
    });

    it('a prefixed URL answers 200 whatever Accept-Language says', async () => {
      expect((await html(origin(), '/en/about', { 'accept-language': 'es' })).status).toBe(200);
      expect((await html(origin(), '/es/about', { 'accept-language': 'en' })).status).toBe(200);
    });

    it('a URL that is no page is not sent anywhere', async () => {
      expect((await html(origin(), '/nada/de/nada')).status).not.toBe(302);
    });
  });

  describe(`${name}: criterion 25, the data endpoint under the prefixed pattern`, () => {
    it('/_fudic/data/en/blog/x answers the load of /en/blog/x', async () => {
      const res = await fetch(`${origin()}/_fudic/data/en/blog/x`);
      expect(await res.json()).toEqual({ data: { slug: 'x' } });
    });
  });

  describe(`${name}: _error.fud in the language of the page (§4.5)`, () => {
    it('a page of /en/ that fails is told so in en', async () => {
      const res = await html(origin(), '/en/missing');
      expect(res.status).toBe(404);
      expect(await res.text()).toContain('Failure 404');
    });

    it('and one of /es/ in es', async () => {
      expect(await (await html(origin(), '/es/missing')).text()).toContain('Error 404');
    });

    it('/_fudic/error/404 speaks the language of the page it comes from', async () => {
      const from = await html(origin(), '/_fudic/error/404', { referer: `${origin()}/en/about` });
      expect(await from.text()).toContain('Failure 404');
      expect(await (await html(origin(), '/_fudic/error/404')).text()).toContain('Error 404');
    });

    it('and /en/_fudic/error/404 in en', async () => {
      expect(await (await html(origin(), '/en/_fudic/error/404')).text()).toContain('Failure 404');
    });
  });
}

describe('dev', () => {
  let root: string;
  let server: ViteDevServer;
  let origin = '';
  beforeAll(async () => {
    root = writeI18nProject({ locales: ['es', 'en'], files: FILES, catalogs: { en: EN } });
    server = await createServer({ root, logLevel: 'silent', plugins: [fudic()], server: { port: 0 } });
    await server.listen();
    origin = `http://localhost:${(server.httpServer!.address() as AddressInfo).port}`;
  }, 120000);
  afterAll(async () => {
    await server.close();
  });

  servesLocales('dev', () => origin);

  it('criterion 28: the head is absolute on the origin of the request, with its own canonical', async () => {
    const page = await (await html(origin, '/en/about')).text();
    expect(page).toContain(`<link rel="canonical" href="${origin}/en/about">`);
    expect(page).toContain(`<link rel="alternate" hreflang="es" href="${origin}/es/about">`);
    expect(page).toContain(`<link rel="alternate" hreflang="en" href="${origin}/en/about">`);
    expect(page).toContain(`<link rel="alternate" hreflang="x-default" href="${origin}/about">`);
  });

  it('renders each locale with its catalog', async () => {
    const en = await (await html(origin, '/en/about')).text();
    expect(en).toContain('Hello world');
    expect(en).toMatch(/<html[^>]* lang="en"/u);
    expect(await (await html(origin, '/es/about')).text()).toContain('Hola mundo');
  });

  it('criterion 30: the page of /en/ hydrates through its own coordinator, from en/', async () => {
    const page = await (await html(origin, '/en/about')).text();
    expect(page).toContain('src="/fudic-main.en.js"');
    const main = await (await fetch(`${origin}/fudic-main.en.js`)).text();
    expect(main).toContain('/@fudic/h/en/');
    const chunk = await fetch(`${origin}/@fudic/h/en/app-counter.js`);
    expect(chunk.status).toBe(200);
    const code = await chunk.text();
    expect(code).toContain('Add one');
    expect(code).not.toContain('Sumar uno');
  });

  it('criterion 34: saving a catalog is seen by /en/… without a restart', async () => {
    const file = join(root, 'src', 'locales', 'en', 'routes', 'about.json');
    writeFileSync(file, readFileSync(file, 'utf8').replace('Hello world', 'Hello there'));
    await vi.waitFor(
      async () => {
        expect(await (await html(origin, '/en/about')).text()).toContain('Hello there');
      },
      { timeout: 10000, interval: 200 },
    );
  });
});

describe('preview', () => {
  let server: PreviewServer;
  let origin = '';
  beforeAll(async () => {
    const root = writeI18nProject({ locales: ['es', 'en'], files: FILES, catalogs: { en: EN } });
    const config = { root, logLevel: 'silent' as const, plugins: [fudic()], preview: { port: 0 } };
    await build({ ...config, build: { minify: false } });
    server = await preview(config);
    origin = `http://localhost:${(server.httpServer.address() as AddressInfo).port}`;
  }, 240000);
  afterAll(async () => {
    await new Promise<void>((resolve) => server.httpServer.close(() => resolve()));
  });

  servesLocales('preview', () => origin);

  it('criterion 28: a page the build wrote is absolute on site', async () => {
    const page = await (await html(origin, '/es/about')).text();
    expect(page).toContain('<link rel="canonical" href="https://example.com/es/about">');
    expect(page).toContain('<link rel="alternate" hreflang="x-default" href="https://example.com/about">');
  });
});
