/**
 * SDD-56 §3.2, §4.4 and §4.6 in the plugin: `load` and `layout` run as part of the request.
 *
 * What the analysis reads from the `@server` (`export const http`, a `load` written as a
 * const), what the render wrapper writes with it — `withRequest`, `pageContext`, `runLoad`
 * with the global and file levels — and that a route with none of that keeps the text of
 * today, importing nothing of `@fudic/http`. Plus the node builtins the edge pass leaves as
 * imports, so `AsyncLocalStorage` is the real one.
 */

import { describe, expect, it } from 'vitest';
import { analyzePage } from '../src/analyze.js';
import { isNodeBuiltin } from '../src/edge.js';
import { emitRenderChunk } from '../src/wrapper.js';

/** A minimal page whose `<head>` holds a `@code` with this `@server` body. */
const page = (server: string): string =>
  `<!DOCTYPE html>\n<html>\n<head>\n@code {\n@server {\n${server}\n}\n}\n</head>\n<body>\n<h1>Hi</h1>\n</body>\n</html>\n`;

describe('analyzePage: what SDD-56 reads from the @server', () => {
  it('export const http is hasHttp', () => {
    expect(analyzePage(page('export const http = chain().use(log);'))).toMatchObject({ hasHttp: true });
  });

  it('a fluent load is fluentLoad, and still hasLoad', () => {
    const a = analyzePage(page('export const load = get().use(auth).handle(async (ctx) => ({}));'));
    expect(a).toMatchObject({ hasLoad: true, fluentLoad: true });
  });

  it('export let / var load count as written const too', () => {
    expect(analyzePage(page('export let load = get().handle(() => ({}));')).fluentLoad).toBe(true);
  });

  it('one declaration of several, load among them, is enough', () => {
    expect(analyzePage(page('export const x = 1, load = get().handle(() => ({}));')).fluentLoad).toBe(true);
  });

  it('a function load is not fluent, and neither field is written when absent', () => {
    const a = analyzePage(page('export async function load(ctx) { return {}; }'));
    expect(a.hasLoad).toBe(true);
    expect('fluentLoad' in a).toBe(false);
    expect('hasHttp' in a).toBe(false);
  });

  it('another exported const, a destructuring or a plain export is not a fluent load', () => {
    const src = page(
      'export const search = get().handle(() => 1);\n' +
        'export const { a } = { a: 1 };\n' +
        'const load = get().handle(() => ({}));\n' +
        'export { load };\n' +
        'export function paths() { return []; }',
    );
    const a = analyzePage(src);
    expect(a.hasLoad).toBe(true);
    expect('fluentLoad' in a).toBe(false);
  });

  it('FUD1010: _error.fud declaring load, paths or a server function', () => {
    const src = page(
      "import { get } from '@fudic/http';\n" +
        'export async function load() { return {}; }\n' +
        'export function paths() { return []; }\n' +
        'export const save = get().handle(() => 1);',
    );
    const found = analyzePage(src, '/app/src/routes/_error.fud').diagnostics.filter((d) => d.code === 'FUD1010');
    expect(found.map((d) => src.slice(d.span.start, d.span.end)).sort()).toEqual(['load', 'paths', 'save']);
    // Windows separators too.
    expect(analyzePage(src, 'C:\\app\\src\\routes\\_error.fud').diagnostics.some((d) => d.code === 'FUD1010')).toBe(true);
  });

  it('the same @server in any other file is no FUD1010; an _error.fud without @server says nothing', () => {
    const src = page('export async function load() { return {}; }');
    expect(analyzePage(src, '/app/src/routes/not_error.fud').diagnostics).toEqual([]);
    expect(analyzePage('<!DOCTYPE html>\n<html><head></head><body></body></html>', '/r/_error.fud').diagnostics).toEqual([]);
  });

  it('http in a specifier list counts as hasHttp', () => {
    expect(analyzePage(page('const http = chain();\nexport { http };')).hasHttp).toBe(true);
  });
});

describe('emitRenderChunk: a route with nothing for @fudic/http to do', () => {
  it('keeps the text of today and imports nothing of @fudic/http', () => {
    const code = emitRenderChunk({ pageModule: '/app/r.fud', hasLoad: true, hasLayout: true, withLoad: true });
    expect(code).not.toContain('@fudic/http');
    expect(code).not.toContain('withRequest');
    expect(code).toContain('const data = await load(ctx);');
  });

  it('the linked variant never imports it, whatever the route has', () => {
    const code = emitRenderChunk({
      pageModule: '/app/r.fud',
      hasLoad: true,
      hasLayout: true,
      hasDi: true,
      hasHttp: true,
      fluentLoad: true,
      globalChain: '/src/http.ts',
      withLoad: false,
    });
    expect(code).not.toContain('@fudic/http');
    expect(code).not.toContain('?server');
    expect(code).not.toContain('/src/http.ts');
  });

  it('a route without load nor layout does not import it either', () => {
    const code = emitRenderChunk({ pageModule: '/app/r.fud', hasLoad: false, hasHttp: true, withLoad: true });
    expect(code).not.toContain('@fudic/http');
    expect(code).not.toContain('$http');
  });
});

describe('emitRenderChunk: load through the chain', () => {
  const base = { pageModule: '/app/r.fud', hasLoad: true, withLoad: true } as const;

  it('export const http: the file level, imported from ?server', () => {
    const code = emitRenderChunk({ ...base, hasHttp: true });
    expect(code).toContain('import { pageContext, runLoad, withRequest } from "@fudic/http/server";');
    expect(code).toContain('import { http as $http } from "/app/r.fud?server";');
    expect(code).toContain('import { load } from "/app/r.fud?server";');
    // The container is opened even without DI: `inject()` a secas needs one (§3.8).
    expect(code).toContain('import { SsrDom, serializeChunks, htmlToByteStream, escapeText, escapeAttr, guardUrl, jsonBlock, iocRoot } from "@fudic/ssr";');
    expect(code).not.toContain('withDi');
    expect(code).not.toContain('publishedSeed');
  });

  it('the data endpoint runs load inside withRequest, with the server ctx', () => {
    const code = emitRenderChunk({ ...base, hasHttp: true });
    expect(code).toContain(
      [
        'export async function data(ctx) {',
        '  const $root = iocRoot();',
        '  const $ctx = pageContext(ctx);',
        '  return withRequest($root, async () => {',
        '    const data = await runLoad(load, { file: $http }, $ctx);',
        '    return { data };',
        '  });',
        '}',
      ].join('\n'),
    );
  });

  it('render does the same, unless the caller already resolved the data', () => {
    const code = emitRenderChunk({ ...base, hasHttp: true });
    expect(code).toContain('    const $root = iocRoot();\n    const $ctx = pageContext(ctx);');
    expect(code).toContain(
      'const data = ctx.data !== undefined ? ctx.data : await withRequest($root, () => runLoad(load, { file: $http }, $ctx));',
    );
  });

  it('src/http.ts: the global level, its default export, outside the file level', () => {
    const code = emitRenderChunk({ ...base, hasHttp: true, globalChain: '/src/http.ts' });
    expect(code).toContain('import $global from "/src/http.ts";');
    expect(code).toContain('runLoad(load, { global: $global, file: $http }, $ctx)');
  });

  it('only the global level', () => {
    const code = emitRenderChunk({ ...base, globalChain: '/src/http.ts' });
    expect(code).toContain('runLoad(load, { global: $global }, $ctx)');
    expect(code).not.toContain('$http');
  });

  it('only a fluent load: no outer level, but through runLoad', () => {
    const code = emitRenderChunk({ ...base, fluentLoad: true });
    expect(code).toContain('runLoad(load, {  }, $ctx)');
    expect(code).not.toContain('$global');
    expect(code).not.toContain('$http');
  });

  it('with DI too: load still gets withDi until the examples migrate', () => {
    const code = emitRenderChunk({ ...base, hasDi: true, hasHttp: true });
    expect(code).toContain('iocRoot, publishedSeed, withDi');
    expect(code).toContain('runLoad(load, { file: $http }, withDi($ctx, $root))');
    expect(code).toContain('yield* page(data, io(ctx), $root, layout);');
  });
});

describe('emitRenderChunk: layout through the request', () => {
  it('with load: the endpoint and render resolve it with $ctx inside withRequest', () => {
    const code = emitRenderChunk({ pageModule: '/app/r.fud', hasLoad: true, hasLayout: true, hasHttp: true, withLoad: true });
    expect(code).toContain('return { data, layout: await layoutProps($ctx, data) };');
    expect(code).toContain(
      'const layout = ctx.layout !== undefined ? ctx.layout : await withRequest($root, () => layoutProps($ctx, data));',
    );
  });

  it('without load: the endpoint has empty data and still resolves the layout', () => {
    const code = emitRenderChunk({ pageModule: '/app/r.fud', hasLoad: false, hasLayout: true, hasHttp: true, withLoad: true });
    expect(code).not.toContain('import { load }');
    expect(code).not.toContain('runLoad(load');
    expect(code).toContain('    const data = {};');
    expect(code).toContain('return { data, layout: await layoutProps($ctx, data) };');
  });
});

describe('isNodeBuiltin: what the edge pass leaves as an import', () => {
  it.each(['node:async_hooks', 'node:crypto', 'node:fs/promises', 'fs', 'path', 'crypto', 'async_hooks'])(
    '%s is a builtin',
    (id) => expect(isNodeBuiltin(id)).toBe(true),
  );

  it.each(['@fudic/di', 'vite', './fs', '/src/http.ts', 'fs-extra'])('%s is not', (id) => {
    expect(isNodeBuiltin(id)).toBe(false);
  });
});
