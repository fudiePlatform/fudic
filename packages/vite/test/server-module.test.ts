/**
 * `.fudic/edge/server.mjs` (SDD-81 §3.10): the module the build leaves for preview and any
 * adapter, written to disk and imported as an adapter would, then asked what `createServer` asks.
 */

import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ServerApp } from '@fudic/server';
import { emitServerModule, type ServerModuleInput } from '../src/server-module.js';

interface Built {
  readonly createApp: (io: { prerendered(pathname: string): Promise<string | null> }) => ServerApp;
  readonly config: unknown;
  readonly bench?: boolean;
}

/** The module of `input`, with `chunks` beside it, imported. */
async function load(input: Partial<ServerModuleInput>, chunks: Record<string, string> = {}): Promise<{ text: string; mod: Built }> {
  const dir = mkdtempSync(join(tmpdir(), 'fudic-server-mjs-'));
  for (const [file, text] of Object.entries(chunks)) writeFileSync(join(dir, file), text);
  const text = emitServerModule({
    base: '/app/',
    locales: [],
    csp: "script-src 'nonce-{nonce}'",
    statics: { '/sw.js': { 'cache-control': 'no-cache' } },
    routes: [],
    errorPages: [],
    errorHints: [],
    config: {},
    ...input,
  });
  writeFileSync(join(dir, 'server.mjs'), text);
  return { text, mod: (await import(pathToFileURL(join(dir, 'server.mjs')).href)) as Built };
}

const page = (name: string): string => `export const name = ${JSON.stringify(name)};\nexport function render() {}\n`;
const none = { prerendered: async () => null };

describe('server.mjs', () => {
  it('carries the app: base, locales, CSP, statics, and fudic.json’s serve as config', async () => {
    const { mod } = await load({ config: { trustProxy: true, uploads: { maxFiles: 3 } } });
    const app = mod.createApp(none);
    expect(app.base).toBe('/app/');
    expect(app.locales).toEqual([]);
    expect(app.csp).toBe("script-src 'nonce-{nonce}'");
    expect(app.statics).toEqual({ '/sw.js': { 'cache-control': 'no-cache' } });
    expect(mod.config).toEqual({ trustProxy: true, uploads: { maxFiles: 3 } });
  });

  it('routes in order; one with a chunk renders, one without only has its prerendered page', async () => {
    const { mod, text } = await load(
      { routes: [{ pattern: '/a', hints: ['</a.css>; rel=preload'], file: 'a.js' }, { pattern: '/b', hints: [] }] },
      { 'a.js': page('a') },
    );
    // Fixed text: a bundler of an adapter follows it.
    expect(text).toContain('() => import("./a.js")');
    const app = mod.createApp(none);
    const routes = app.routes();
    expect(routes.map((r) => [r.pattern, r.renders])).toEqual([
      ['/a', true],
      ['/b', false],
    ]);
    expect(await routes[0]!.hints()).toEqual(['</a.css>; rel=preload']);
    expect(((await app.module('/a')) as unknown as { name: string }).name).toBe('a');
    expect(() => app.module('/b')).toThrow('no render module for /b');
  });

  it('prerendered is what the host gives it', async () => {
    const { mod } = await load({});
    const app = mod.createApp({ prerendered: async (path) => (path === '/x' ? '<p>x</p>' : null) });
    expect(await app.prerendered('/x')).toBe('<p>x</p>');
    expect(await app.prerendered('/y')).toBeNull();
  });

  it('one locale: its single error page, with the hints of the app’s', async () => {
    const { mod } = await load({ errorPages: [{ locale: '', file: 'error.js' }], errorHints: ['</e.css>'] }, { 'error.js': page('error') });
    const found = await mod.createApp(none).errorPage(undefined);
    expect((found!.module as unknown as { name: string }).name).toBe('error');
    expect(found!.hints).toEqual(['</e.css>']);
  });

  it('two or more locales: each its own, the first without one, none for an unknown one', async () => {
    const { mod } = await load(
      { locales: ['es', 'en'], errorPages: [{ locale: 'es', file: 'es.js' }, { locale: 'en', file: 'en.js' }] },
      { 'es.js': page('es'), 'en.js': page('en') },
    );
    const app = mod.createApp(none);
    const nameOf = async (locale: string | undefined): Promise<string | undefined> =>
      ((await app.errorPage(locale))?.module as unknown as { name: string } | undefined)?.name;
    expect(await nameOf('en')).toBe('en');
    expect(await nameOf(undefined)).toBe('es');
    expect(await app.errorPage('fr')).toBeNull();
  });

  it('no _error.fud: null, the minimal page', async () => {
    const { mod } = await load({});
    expect(await mod.createApp(none).errorPage(undefined)).toBeNull();
  });

  it('functions: the server root’s handler when the app has them, none otherwise', async () => {
    const { mod } = await load({ functions: 'functions.mjs' }, { 'functions.mjs': 'export const handler = (o) => o;\n' });
    expect(mod.createApp(none).functions?.({ base: '/app/', dev: false, secureCookies: true }) as unknown).toEqual({
      base: '/app/',
      dev: false,
      secureCookies: true,
    });
    const { mod: bare, text } = await load({});
    expect(text).not.toContain('handler');
    expect(bare.createApp(none).functions).toBeUndefined();
  });
});

describe('the workbench’s own build (SDD-82 §4.7)', () => {
  it('says so in a bench export; any other build has none', async () => {
    expect((await load({ bench: true })).mod.bench).toBe(true);
    expect((await load({})).mod.bench).toBeUndefined();
  });
});
