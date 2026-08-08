/**
 * The client chunks (SDD-15 §6.8) as the plugin sees them: which components get one, what
 * they are called, and what the `?client` transform produces.
 *
 * The rule under test is that there is NO rule — every component of the graph gets a chunk.
 * Who hydrates is decided where rendering happens (the edge at request time, the Service
 * Worker at navigation time) and always with data in hand, so a build-time filter would be
 * guessing. What IS decided here is reachability: a component nobody links is not part of
 * the app, and an excluded route contributes nothing.
 */

import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CLIENT_QUERY, clientChunkName, clientId, discoverComponents } from '../src/client.js';
import { transformFud, transformFudClient } from '../src/transform.js';
import { discoverRoutes } from '../src/discover.js';
import { resolveOptions } from '../src/options.js';
import { nodeIo } from '../src/io.js';
import { fudic } from '../src/index.js';

const io = nodeIo();

const component = (tag: string, body = '<span><slot></slot></span>', links = ''): string =>
  `${links}<${tag}>\n  <template shadowrootmode="open">${body}</template>\n</${tag}>\n`;

/**
 * A project with one component per way of being reached: linked by a page, linked only by
 * another component, linked only by a layout, and linked only by an excluded route.
 */
function project(): string {
  const root = mkdtempSync(join(tmpdir(), 'fudic-client-'));
  mkdirSync(join(root, 'components'), { recursive: true });
  mkdirSync(join(root, 'layouts'), { recursive: true });
  mkdirSync(join(root, 'routes'), { recursive: true });

  writeFileSync(join(root, 'components', 'app-badge.fud'), component('app-badge'));
  writeFileSync(
    join(root, 'components', 'app-card.fud'),
    '@code {\n  const { title } = props<{ title: string }>();\n}\n' +
      component(
        'app-card',
        '<article><h2>@title</h2><app-badge>x</app-badge></article>',
        '<link rel="component" href="./app-badge.fud">\n',
      ),
  );
  writeFileSync(join(root, 'components', 'site-nav.fud'), component('site-nav'));
  writeFileSync(join(root, 'components', 'x-secret.fud'), component('x-secret'));
  // Nobody links this one: it is here for the transform, which works on any component.
  // Its `@client` region is TypeScript and its `<img>` points nowhere — the two things the
  // plugin has to do on top of the emit.
  writeFileSync(
    join(root, 'components', 'x-typed.fud'),
    '@code {\n  @client {\n    function press(e: MouseEvent): void {\n      e.preventDefault();\n    }\n  }\n}\n' +
      component('x-typed', '<img src="./nope.png">'),
  );

  writeFileSync(
    join(root, 'layouts', '_layout.fud'),
    '<!DOCTYPE html>\n<html>\n  <head>\n' +
      '    <link rel="component" href="../components/site-nav.fud">\n' +
      '    @RenderHead()\n  </head>\n' +
      '  <body><site-nav></site-nav><main>@RenderBody()</main></body>\n</html>\n',
  );
  // Two routes linking the SAME component: the chunk is per component, not per use.
  const page = (): string =>
    '<link rel="layout" href="../layouts/_layout.fud">\n' +
    '<link rel="component" href="../components/app-card.fud">\n\n' +
    '<head>\n  <title>P</title>\n</head>\n\n<app-card title="t"></app-card>\n';
  writeFileSync(join(root, 'routes', 'index.fud'), page());
  writeFileSync(join(root, 'routes', 'about.fud'), page());
  writeFileSync(
    join(root, 'routes', 'hidden.fud'),
    '<link rel="component" href="../components/x-secret.fud">\n' +
      '<head><title>H</title></head>\n<x-secret></x-secret>\n',
  );
  return root;
}

const root = project();
// `routesDir` explicit, and deliberately the old convention: this file and plugin.test.ts
// are the two that keep the knob exercised, so the default moving under `src/` must not move
// them (BUG-20 §6.10).
const builds = discoverRoutes(
  root,
  resolveOptions({ routesDir: 'routes', defaults: { '/hidden': { mode: 'exclude' } } }).options,
).routes;

describe('discoverComponents', () => {
  const found = discoverComponents(builds, io);

  it('finds every component the built routes reach, whichever way they reach it', () => {
    // app-card from the page, app-badge only through app-card, site-nav only through the
    // layout. Sorted, so two builds of the same project emit the same names.
    expect(found.map((c) => c.tag)).toEqual(['app-badge', 'app-card', 'site-nav']);
  });

  it('emits one chunk per component, not one per use', () => {
    // Two routes link app-card; the second finds it already resolved.
    expect(found.filter((c) => c.tag === 'app-card')).toHaveLength(1);
  });

  it('leaves out a component only an excluded route reaches', () => {
    expect(found.map((c) => c.tag)).not.toContain('x-secret');
  });

  it('points at the component file itself, wherever it lives', () => {
    expect(found.find((c) => c.tag === 'site-nav')?.path).toBe(
      join(root, 'components', 'site-nav.fud'),
    );
  });
});

describe('the chunk id and its name', () => {
  it('is the component path with the client query', () => {
    expect(clientId('/x/app-card.fud')).toBe(`/x/app-card.fud?${CLIENT_QUERY}`);
  });

  it('lands in its own directory, keyed by tag', () => {
    expect(clientChunkName('app-card')).toBe('h/app-card');
  });
});

describe('transformFudClient', () => {
  const cardPath = join(root, 'components', 'app-card.fud');

  it('emits the factory and the define, and nothing of the server module', () => {
    const out = transformFudClient(cardPath, io)!;
    expect(out.code).toContain("import { FudicElement } from '@fudic/core';");
    expect(out.code).toContain('customElements.define("app-card", class extends FudicElement {');
    expect(out.code).toContain('static c($props)');
    expect(out.code).not.toContain('export function render');
    expect(out.map.mappings.length).toBeGreaterThan(0);
  });

  it('is a different module from the one the same file transforms to normally', () => {
    expect(transformFud(cardPath, io)!.code).toContain('export function render');
  });

  it('returns null for anything that is not a component', () => {
    // A page, a route and a layout are RENDERED; what comes alive in the browser is always
    // a custom element.
    expect(transformFudClient(join(root, 'routes', 'index.fud'), io)).toBeNull();
    expect(transformFudClient(join(root, 'layouts', '_layout.fud'), io)).toBeNull();
    expect(transformFudClient(join(root, 'sw.json'), io)).toBeNull();
  });

  it('copies the @client region verbatim, TypeScript included', () => {
    // The chunk is bundler INPUT (§4.7). Stripping types is the bundler's job, and the
    // plugin's `?client` branch below is where that happens.
    expect(transformFudClient(join(root, 'components', 'x-typed.fud'), io)!.code).toContain(
      'function press(e: MouseEvent): void {',
    );
  });
});

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyHook = any;

describe("the plugin's ?client branch", () => {
  const plugin = ((): AnyHook => {
    const p = fudic({ routesDir: 'routes' }) as AnyHook;
    p.config({});
    p.configResolved({ root, base: '/', command: 'build', build: { outDir: 'dist' } });
    return p;
  })();
  const ctx = { warn: vi.fn(), emitFile: vi.fn() };

  it('hands the bundler plain JavaScript', async () => {
    const out = await plugin.transform.call(ctx, '', clientId(join(root, 'components', 'x-typed.fud')));
    expect(out.code).toContain('customElements.define("x-typed"');
    expect(out.code).toContain('function press(e)'); // was `(e: MouseEvent): void`
    expect(out.code).not.toContain('MouseEvent');
  });

  it('reports an asset the component references and the build has not got', async () => {
    ctx.warn.mockClear();
    await plugin.transform.call(ctx, '', clientId(join(root, 'components', 'x-typed.fud')));
    expect(ctx.warn.mock.calls.flat().join('\n')).toContain('nope.png');
  });

  it('leaves a non-component alone, even when asked for its client chunk', async () => {
    expect(await plugin.transform.call(ctx, '', clientId(join(root, 'routes', 'index.fud')))).toBeNull();
  });
});
