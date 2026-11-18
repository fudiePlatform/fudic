/**
 * SDD-86 task 10, criterion 15 — a file that uses no lifecycle hook emits, byte for byte, what
 * it emitted before SDD-86.
 *
 * Locked BEFORE the emit learned the hooks: every fixture without hooks, components, the page,
 * a route with its layout (server and client halves), and a route whose `@code` has a client
 * half — every emitter the hooks touch (`module`, `markup`, `layout`, `client`, `route-client`).
 * The component goldens are the ones `golden.test.ts` already owns; the route ones live under
 * `__golden__/untouched/`.
 *
 * Regenerating them would be saying «a file without hooks now emits something else», which is
 * exactly what this SDD promises not to do. Do not pass `-u` here.
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  resolveComponents,
  emitComponentModule,
  emitComponentClientModule,
  emitPageModule,
  emitLayoutModule,
  emitRouteModule,
  emitRouteClientModule,
  type ComponentGraph,
} from '../../src/emit/index.js';
import { resolveDocument } from '../../src/emit/resolve.js';
import { fixturesDir, fixtureIo, layoutFixturesDir, memoryIo } from './_support.js';

const goldenDir = join(dirname(fileURLToPath(import.meta.url)), '__golden__');
const golden = (file: string): string => join(goldenDir, file);
const untouched = (file: string): string => join(goldenDir, 'untouched', file);

const page: ComponentGraph = resolveComponents(join(fixturesDir, 'home.fud'), fixtureIo);
const TAGS = ['app-actions', 'app-badge', 'app-button', 'app-calendar', 'app-card', 'app-list'];

describe('components without hooks (criterion 15)', () => {
  for (const tag of TAGS) {
    it(`${tag}: server module unchanged`, async () => {
      await expect(emitComponentModule(page, page.components.get(tag)!)).toMatchFileSnapshot(golden(`${tag}.mjs`));
    });
    it(`${tag}: client chunk unchanged`, async () => {
      await expect(emitComponentClientModule(page, page.components.get(tag)!)).toMatchFileSnapshot(
        golden(`${tag}.client.mjs`),
      );
    });
  }

  it('the page module unchanged', async () => {
    await expect(emitPageModule(page)).toMatchFileSnapshot(golden('home.mjs'));
  });
});

describe('a route and its layout without hooks (criterion 15)', () => {
  const blog = resolveDocument(join(layoutFixturesDir, 'blog.fud'), fixtureIo).value;

  it('blog: route module unchanged', async () => {
    await expect(emitRouteModule(blog)).toMatchFileSnapshot(untouched('blog.route.mjs'));
  });

  it('blog: layout module unchanged', async () => {
    await expect(emitLayoutModule(blog, blog.layouts[0]!)).toMatchFileSnapshot(untouched('blog.layout.mjs'));
  });

  it('blog: still no client chunk', () => {
    expect(emitRouteClientModule(blog)).toBeNull();
  });
});

/** A route with a client half — state, an event, a `ref` — and a layout with `@code`. */
const LAYOUT = [
  '<!DOCTYPE html><html><head>@RenderHead()</head>',
  '<body>',
  '@code { const { site = "fudic" } = props<{ site?: string }>(); }',
  '<header>@site</header>',
  '<main>@RenderBody()</main>',
  '</body></html>',
].join('\n');

const ROUTE = [
  '<link rel="layout" href="./l.fud">',
  '@code {',
  "  import { signal } from '@fudic/core';",
  '  const n = signal(0);',
  '  let out;',
  '  function more() { n.set(n() + 1); }',
  '}',
  '<button @click=@more>+</button>',
  '<output ref="@out">@n()</output>',
].join('\n');

describe('a reactive route without hooks (criterion 15)', () => {
  const graph = resolveDocument('/r.fud', memoryIo({ '/r.fud': ROUTE, '/l.fud': LAYOUT })).value;

  it('client chunk unchanged', async () => {
    const chunk = emitRouteClientModule(graph);
    expect(chunk).not.toBeNull();
    await expect(chunk).toMatchFileSnapshot(untouched('reactive.route.client.mjs'));
  });

  it('server module unchanged', async () => {
    await expect(emitRouteModule(graph)).toMatchFileSnapshot(untouched('reactive.route.mjs'));
  });

  it('layout module unchanged', async () => {
    await expect(emitLayoutModule(graph, graph.layouts[0]!)).toMatchFileSnapshot(untouched('reactive.layout.mjs'));
  });
});
