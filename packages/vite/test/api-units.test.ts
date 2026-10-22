/**
 * SDD-60 §3.10, §3.11, §4.4, §4.5 and criterion 9 (the host's half) — the pieces the plugin
 * builds from the `.fudapi` of a project, one by one.
 */

import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseApi, type LoadDecl } from '@fudic/api';
import { ApiProject, libraryFiles } from '../src/api-modules.js';
import { BROWSER_ROOT_ID, SERVER_ROOT_ID, emitRoot } from '../src/api-root.js';
import { analyzePage, type PageApi } from '../src/analyze.js';
import { strategyOfLoad } from '../src/strategy.js';
import { emitRenderChunk } from '../src/wrapper.js';
import { emitFunctionsModule } from '../src/functions.js';

function tree(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), 'fudic-api-units-')).replace(/\\/gu, '/');
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

const PROJECT = {
  'package.json': JSON.stringify({ dependencies: { 'lib-a': '1', 'lib-b': '1' }, devDependencies: { 'lib-c': '1' } }),
  'src/routes/blog/[slug].fudapi': 'load ssg\n  title  str\n\npaths\n\nput save /:id\n  form person\n  id  i32\n',
  'src/routes/blog/[slug].fud': '<p>x</p>',
  'src/routes/index.fudapi': 'layout\n',
  'src/routes/index.fud': '<link rel="layout" href="./_layout.fud">\n<p>x</p>',
  'src/routes/_error.fudapi': 'get ping\n',
  'src/routes/_error.fud': '<p>x</p>',
  'src/routes/orphan.fudapi': 'get lonely /all\n',
  'src/components/c.fudapi': 'form person\n  name  str\n\nget check\n  -> bool\n',
  'src/broken.fudapi': 'get\n',
  'src/.hidden/x.fudapi': 'get hidden\n',
  'src/node_modules/y.fudapi': 'get vendored\n',
  'node_modules/lib-a/fudapi/rules.fudapi': 'rule shout\n  on field str\n  runs both\n  fails loud\n',
  'node_modules/lib-a/browser/rules.js': '',
  'node_modules/lib-a/browser/rules.js.map': '{}',
  'node_modules/lib-b/index.js': '',
  'node_modules/lib-c/fudic.json': JSON.stringify({ api: 'contracts', server: 'out/s' }),
  'node_modules/lib-c/contracts/mw.fudapi': 'middleware tag\n  server\n',
  'node_modules/lib-c/out/s/mw.js': '',
  'node_modules/indirect/fudapi/z.fudapi': 'get indirect\n',
};

describe('ApiProject', () => {
  const root = tree(PROJECT);
  const api = new ApiProject(root);

  it('criterion 9: the app under src/ and the fudapi/ of each direct dependency, nothing else', () => {
    expect([...api.ids()].sort()).toEqual([
      'broken',
      'components/c',
      'lib-a/rules',
      'lib-c/mw',
      'routes/_error',
      'routes/blog/[slug]',
      'routes/index',
      'routes/orphan',
    ]);
    expect(api.libraries).toEqual([
      { name: 'lib-a', dir: `${root}/node_modules/lib-a`, server: 'server', browser: 'browser' },
      { name: 'lib-c', dir: `${root}/node_modules/lib-c`, server: 'out/s', browser: 'browser' },
    ]);
  });

  it('where a file sits: a route sibling, the index, _error, or nowhere', () => {
    const at = (id: string) => api.context(api.source(id)!);
    expect(at('routes/blog/[slug]')).toEqual({ route: { params: ['slug'], pattern: '/blog/:slug' } });
    // With a `<link rel="layout">`, the props its `layout.handle` returns (SDD-60 §3.4).
    const layoutProps = "import('../../../src/routes/_layout.fud').$Props";
    expect(at('routes/index')).toEqual({ route: { params: [], pattern: '/', layoutProps } });
    expect(at('routes/_error')).toEqual({ route: { params: [], pattern: '/_error', error: true } });
    expect(at('routes/orphan')).toEqual({});
    expect(at('lib-a/rules')).toEqual({});
  });

  it('the module of each side, and none for an id the project lacks', () => {
    expect(api.module('routes/blog/[slug]', 'server')).toContain('fn({');
    expect(api.module('routes/blog/[slug]', 'browser')).toContain('stub({');
    expect(api.module('routes/none', 'server')).toBeUndefined();
  });

  it('what the compiler is told about a linked file', () => {
    expect(api.linked(`${root}/src/routes/blog/[slug].fudapi`)).toEqual({
      id: 'routes/blog/[slug]',
      load: true,
      paths: true,
      layout: false,
      functions: ['save'],
      forms: ['person'],
      route: `${root}/src/routes/blog/[slug].fud`,
    });
    expect(api.linked(`${root}/src/components/c.fudapi`)).toEqual({
      id: 'components/c',
      load: false,
      paths: false,
      layout: false,
      functions: ['check'],
      forms: ['person'],
    });
    expect(api.linked(`${root}/src/none.fudapi`)).toBeUndefined();
  });

  it('what a route reads of its page', () => {
    const page = api.page(`${root}/src/routes/blog/[slug].fudapi`)!;
    expect(page).toMatchObject({ id: 'routes/blog/[slug]', paths: true, layout: false });
    expect(page.load?.mode?.text).toBe('ssg');
    expect(api.page(`${root}/src/routes/index.fudapi`)).toEqual({ id: 'routes/index', paths: false, layout: true });
    expect(api.page(`${root}/src/none.fudapi`)).toBeUndefined();
  });

  it('every function by URL pattern and method', () => {
    expect(api.functionTable()).toEqual(
      expect.arrayContaining([
        { url: '/_fudic/fn/routes/blog/:slug/save/:id', method: 'PUT' },
        { url: '/_fudic/fn/components/c/check', method: 'GET' },
        { url: '/_fudic/fn/routes/orphan/lonely/all', method: 'GET' },
      ]),
    );
  });

  it('the diagnostics of the app files, and only of those that have some', () => {
    // `_error` declares a function: FUD1010.
    expect(api.diagnostics().map((f) => f.file)).toEqual([`${root}/src/broken.fudapi`, `${root}/src/routes/_error.fudapi`]);
  });

  it('writes each .d.ts once, and again only when its text changes', () => {
    const written = api.writeDeclarations();
    expect(written).toContain(`${root}/.fudic/api/routes/blog/[slug].d.ts`);
    const before = statSync(`${root}/.fudic/api/components/c.d.ts`).mtimeMs;
    expect(api.writeDeclarations()).toEqual([]);
    expect(statSync(`${root}/.fudic/api/components/c.d.ts`).mtimeMs).toBe(before);
    writeFileSync(`${root}/src/components/c.fudapi`, 'get check\n  -> str\n');
    // The form goes away: its own file changes, and so does the route whose function takes it.
    api.invalidate();
    expect([...api.writeDeclarations()].sort()).toEqual([`${root}/.fudic/api/components/c.d.ts`, `${root}/.fudic/api/routes/blog/[slug].d.ts`]);
  });

  it('a project without package.json, or with one that does not parse, has no libraries', () => {
    expect(new ApiProject(tree({ 'src/a.fudapi': 'get a\n' })).libraries).toEqual([]);
    expect(new ApiProject(tree({ 'package.json': '{', 'src/a.fudapi': 'get a\n' })).ids()).toEqual(['a']);
    expect(new ApiProject(tree({ 'package.json': '{}' })).ids()).toEqual([]);
  });

  it('the compiled files of a library folder: .js only, and none for a folder that is not there', () => {
    expect(libraryFiles(`${root}/node_modules/lib-a/browser`)).toEqual([`${root}/node_modules/lib-a/browser/rules.js`]);
    expect(libraryFiles(`${root}/node_modules/lib-a/server`)).toEqual([]);
  });
});

describe('emitRoot', () => {
  const root = tree(PROJECT);
  const libraries = new ApiProject(root).libraries;

  it('the server: every contract, the libraries and both folders of the app, in order, and its handler', () => {
    const text = emitRoot({ side: 'server', folders: { server: 'src/back', browser: 'src/front' }, libraries, ids: ['routes/a'] });
    expect(text).toContain('import "fudic:routes/a";');
    expect(text).toContain("import { contractsHandler } from '@fudic/http/contract/server';");
    expect(text).toContain('"lib-a/browser/rules.js": () => import(');
    expect(text).toContain('"lib-c/out/s/mw.js": () => import(');
    expect(text.indexOf('/src/front/**')).toBeLessThan(text.indexOf('/src/back/**'));
    expect(text).toContain('setSourceMapsEnabled');
    expect(text).toContain('export function handler(options)');
  });

  it('the browser: only the browser folders, and no handler', () => {
    const text = emitRoot({ side: 'browser', folders: { server: 'src/server', browser: 'src/browser' }, libraries, ids: ['routes/a'] });
    expect(text).not.toContain('fudic:routes/a');
    expect(text).not.toContain('/src/server/**');
    expect(text).not.toContain('handler');
    expect(text).toContain('export const ready = inTurn(load);');
  });

  it('a load never empties the registry, and waits for the root before it: one root per locale', () => {
    const text = emitRoot({ side: 'server', folders: { server: 'src/server', browser: 'src/browser' }, libraries, ids: [] });
    expect(text).not.toContain('resetRegistry');
    expect(text).toContain('export const ready = inTurn(load);');
  });

  it('the ids of the two roots', () => {
    expect([SERVER_ROOT_ID, BROWSER_ROOT_ID]).toEqual(['fudic:$root/server', 'fudic:$root/browser']);
  });
});

describe('strategyOfLoad (§4.5)', () => {
  const load = (line: string): LoadDecl =>
    parseApi(`${line}\n  n  i32\n`).value.declarations[0] as LoadDecl;

  it('no load, or one with no option, declares nothing', () => {
    expect(strategyOfLoad(undefined)).toEqual({ declared: false, strategy: {}, diagnostics: [] });
    expect(strategyOfLoad(load('load'))).toEqual({ declared: false, strategy: {}, diagnostics: [] });
  });

  it('the whole line, as strategy({ … }) would have said it', () => {
    expect(strategyOfLoad(load('load sw ttl 5m cache-first page persist 1h')).strategy).toEqual({
      mode: 'sw',
      data: { ttl: '5m', policy: 'cache-first' },
      page: { cache: 'persist', ttl: '1h' },
    });
    expect(strategyOfLoad(load('load page never'))).toEqual({ declared: true, strategy: { page: { cache: 'never' } }, diagnostics: [] });
  });
});

describe('analyzePage with a linked .fudapi (§4.5)', () => {
  const ROUTE = '<link rel="layout" href="./l.fud">\n<link rel="server">\n<link rel="server" href="./other.fudapi">\n<link rel="server" href="./r.fudapi">\n<p>x</p>\n';
  const own: PageApi = { id: 'routes/r', paths: true, layout: true, load: parseApi('load ssr\n  n  i32\n').value.declarations[0] as LoadDecl };

  it('load, paths, layout and the strategy come from the file of the route', () => {
    const apis: Record<string, PageApi> = { './other.fudapi': { id: 'routes/other', paths: false, layout: false }, './r.fudapi': own };
    const analysis = analyzePage(ROUTE, '/src/routes/r.fud', (href) => apis[href]);
    expect(analysis).toMatchObject({ hasLoad: true, hasPaths: true, hasLayout: true, api: 'routes/r', strategy: { declared: true, strategy: { mode: 'ssr' } } });
  });

  it('a file without load is the page’s all the same when it has paths', () => {
    const analysis = analyzePage(ROUTE, '/src/routes/r.fud', (href) => (href === './r.fudapi' ? { id: 'routes/r', paths: true, layout: false } : undefined));
    expect(analysis).toMatchObject({ hasLoad: false, hasPaths: true, hasLayout: false, api: 'routes/r', strategy: { declared: false } });
  });

  it('without anybody to read the links, the route has no contract', () => {
    expect(analyzePage(ROUTE, '/src/routes/r.fud')).not.toHaveProperty('api');
  });
});

describe('the wrapper of a route with a .fudapi (§4.4)', () => {
  const api = { id: 'routes/blog/[slug]', root: SERVER_ROOT_ID, dev: true };

  it('load, layout and paths from the registry, once the root is ready', () => {
    const text = emitRenderChunk({ pageModule: '/p.fud', hasLoad: true, hasPaths: true, hasLayout: true, withLoad: true, api });
    expect(text).toContain(`import { ready as $ready } from "${SERVER_ROOT_ID}";`);
    expect(text).toContain('import { load as $load, layout as $layout, paths as $paths } from "fudic:routes/blog/[slug]";');
    expect(text).toContain('$ready.then(() => $runLoad($load, $ctx, true))');
    expect(text).toContain('return $impl($layout)(ctx, data);');
    expect(text).toContain('return $impl($paths)();');
    expect(text).not.toContain('?server');
  });

  it('a layout alone still goes through the request', () => {
    const text = emitRenderChunk({ pageModule: '/p.fud', hasLoad: false, hasLayout: true, withLoad: true, api });
    expect(text).toContain('import { layout as $layout } from');
    expect(text).toContain('const $ctx = pageContext(ctx);');
  });

  it('the Service Worker variant imports nothing of it', () => {
    const text = emitRenderChunk({ pageModule: '/p.fud', hasLoad: true, hasPaths: true, withLoad: false, api });
    expect(text).not.toContain('fudic:');
  });
});

describe('functions.mjs with the functions of the .fudapi', () => {
  it('the contracts are asked first, the ?server modules after', () => {
    const text = emitFunctionsModule({ routes: [], components: [], httpFile: undefined, base: '/', table: [], api: SERVER_ROOT_ID });
    expect(text).toContain(`import { handler as $api } from "${SERVER_ROOT_ID}";`);
    expect(text).toContain('export const handle = async (request) => (await $contracts(request)) ?? $legacy(request);');
  });
});
