/**
 * The document graph of a route, resolved once per build.
 *
 * Nothing about the OUTPUT changes with the memory, so most of this file counts work: how many
 * times a `.fud` is read, how many times a route's graph is resolved. The rest is the other
 * half of the contract — a fresh memory per build, and none at all in dev, where the files
 * change between two requests.
 */

import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import type { ResolveIo } from '@fudic/compiler';

/** Every `resolveDocument` the plugin's modules asked for, by path. */
const resolved = vi.hoisted(() => ({ paths: [] as string[] }));

vi.mock('@fudic/compiler', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fudic/compiler')>();
  return {
    ...actual,
    resolveDocument: (...args: Parameters<typeof actual.resolveDocument>) => {
      resolved.paths.push(args[0]);
      return actual.resolveDocument(...args);
    },
  };
});

// The project typecheck `buildStart` runs, answered clean: what it would say is not what this
// file measures, and checking the compiler package is minutes of work.
vi.mock('@fudic/typecheck', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fudic/typecheck')>()),
  createProjectChecker: () => ({
    check: () => ({ problems: [], project: [], inputs: [] }),
    invalidate: () => undefined,
  }),
}));

const { graphOf, memoizedGraphs } = await import('../src/graph-cache.js');
const { fudic } = await import('../src/index.js');

const fixtures = fileURLToPath(new URL('../../compiler/fixtures', import.meta.url));
const compilerRoot = fileURLToPath(new URL('../../compiler', import.meta.url));
const home = join(fixtures, 'home.fud');

/** A `ResolveIo` over the disk that counts what it read. */
function countingIo(): { io: ResolveIo; reads: string[]; resolves: Array<[string, string]> } {
  const reads: string[] = [];
  const resolves: Array<[string, string]> = [];
  const io: ResolveIo = {
    read: (path) => {
      reads.push(path);
      return readFileSync(path, 'utf8');
    },
    resolve: (fromPath, href) => {
      resolves.push([fromPath, href]);
      return resolve(dirname(fromPath), href);
    },
  };
  return { io, reads, resolves };
}

/** A route that links one component, and that component. */
function project(): { root: string; route: string; component: (name: string) => string } {
  const root = mkdtempSync(join(tmpdir(), 'fudic-graph-cache-'));
  mkdirSync(join(root, 'routes'), { recursive: true });
  const component = (name: string): string => {
    const file = join(root, 'routes', `${name}.fud`);
    writeFileSync(file, `<${name}><template shadowrootmode="open"><slot></slot></template></${name}>\n`);
    return file;
  };
  const route = join(root, 'routes', 'index.fud');
  return { root, route, component };
}

const page = (...tags: string[]): string =>
  `<!DOCTYPE html><html><head>${tags.map((t) => `<link rel="component" href="./${t}.fud">`).join('')}</head><body>${tags
    .map((t) => `<${t}></${t}>`)
    .join('')}</body></html>\n`;

const tagsOf = (graph: ReturnType<typeof graphOf>): string[] => [...graph.components.keys()].sort();

describe('memoizedGraphs', () => {
  it('read and resolve are the wrapped io’s', () => {
    const { io, reads, resolves } = countingIo();
    const memo = memoizedGraphs(io);
    expect(memo.read(home)).toBe(readFileSync(home, 'utf8'));
    expect(memo.resolve(home, './app-card.fud')).toBe(join(fixtures, 'app-card.fud'));
    expect(reads).toEqual([home]);
    expect(resolves).toEqual([[home, './app-card.fud']]);
  });

  it('resolves a document once, however many times it is asked', () => {
    const { io, reads } = countingIo();
    const memo = memoizedGraphs(io);
    const first = memo.graph(home);
    const readsOfOne = reads.length;
    expect(readsOfOne).toBeGreaterThan(1); // the page and the components it links
    expect(memo.graph(home)).toBe(first);
    expect(graphOf(home, memo)).toBe(first);
    expect(reads).toHaveLength(readsOfOne);
  });

  it('keeps one graph per document', () => {
    const memo = memoizedGraphs(countingIo().io);
    const card = memo.graph(join(fixtures, 'app-card.fud'));
    expect(memo.graph(home)).not.toBe(card);
    expect(memo.graph(join(fixtures, 'app-card.fud'))).toBe(card);
  });
});

describe('graphOf over a plain io (dev)', () => {
  it('resolves afresh every time, so a saved file is seen', () => {
    const { route, component } = project();
    component('x-uno');
    component('x-dos');
    const { io, reads } = countingIo();
    writeFileSync(route, page('x-uno'));
    expect(tagsOf(graphOf(route, io))).toEqual(['x-uno']);
    const readsOfOne = reads.length;

    writeFileSync(route, page('x-uno', 'x-dos'));
    expect(tagsOf(graphOf(route, io))).toEqual(['x-dos', 'x-uno']);
    expect(reads.length).toBeGreaterThan(readsOfOne);
  });
});

/* eslint-disable @typescript-eslint/no-explicit-any */
function plugin(root: string, routesDir: string, command: 'build' | 'serve'): any {
  const p = fudic({ routesDir }) as any;
  p.config({});
  p.configResolved({ root, base: '/', command, build: { outDir: 'dist' } });
  return p;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const emitCtx = (): { emitFile: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> } => ({
  emitFile: vi.fn((o: { id?: string }) => `ref:${o.id ?? 'x'}`),
  warn: vi.fn(),
  error: vi.fn(),
});

const emittedChunks = (ctx: ReturnType<typeof emitCtx>): string[] =>
  ctx.emitFile.mock.calls
    .map(([o]) => (o as { name?: string }).name ?? '')
    .filter((n) => n.startsWith('h/'))
    .sort();

describe('in a build, each route is resolved once', () => {
  it('buildStart asks a route many questions and walks its graph ONCE', async () => {
    resolved.paths = [];
    await plugin(compilerRoot, 'fixtures', 'build').buildStart.call(emitCtx());
    // Whether it hydrates, whether it injects, which components it reaches, whether it is
    // reactive: four walks of the same graph before the memory, one with it.
    expect(resolved.paths.filter((p) => p === home)).toHaveLength(1);
  });

  it('a new build is a new memory: a component linked between two builds is emitted', async () => {
    const { root, route, component } = project();
    component('x-uno');
    component('x-dos');
    writeFileSync(route, page('x-uno'));
    const p = plugin(root, 'routes', 'build');

    const first = emitCtx();
    await p.buildStart.call(first);
    expect(emittedChunks(first)).toEqual(['h/x-uno']);

    // What a watch rebuild sees: the same plugin, the route saved in between.
    writeFileSync(route, page('x-uno', 'x-dos'));
    const second = emitCtx();
    await p.buildStart.call(second);
    expect(emittedChunks(second)).toEqual(['h/x-dos', 'h/x-uno']);
  });
});
