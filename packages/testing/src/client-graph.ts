/**
 * What a component takes to the browser (§3.10): the imports of its `?client` chunk, walked
 * with the plugin's CLIENT transform — the one that erases a `serverValidator`'s argument and
 * a middleware's `.server` half — and without running any of it.
 *
 * The test's own graph cannot answer this: it runs every module through the SSR path, where
 * nothing is erased (§4.1). So the walk has a Vite of its own, with the project's plugin, made
 * on the first call and kept for the rest of the file.
 */

import { relative, resolve } from 'node:path';
import type { FudicOptions } from '@fudic/vite';
import type { ViteDevServer } from 'vite';
import { inject } from 'vitest';
import { FILE_EXPORT, OPTIONS_KEY, ROOT_KEY } from './constants.js';
import type { FudModule } from './mount.js';

/** The project files a component's client chunk reaches, relative to the root. */
export interface ClientGraph {
  readonly files: readonly string[];
}

let vite: Promise<ViteDevServer> | undefined;

/** The Vite the walks transform with: the project's plugin, nothing served, nothing watched. */
function server(): Promise<ViteDevServer> {
  vite ??= (async () => {
    const [{ createServer }, { fudic }] = await Promise.all([import('vite'), import('@fudic/vite')]);
    const { base, ...options } = inject(OPTIONS_KEY);
    return createServer({
      root: inject(ROOT_KEY),
      base,
      configFile: false,
      logLevel: 'silent',
      appType: 'custom',
      optimizeDeps: { noDiscovery: true, include: [] },
      server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      plugins: [fudic({ ...(options as FudicOptions), liveCheck: false })],
    });
  })();
  return vite;
}

/** Close the Vite of the walks, if this file made one. */
export async function closeClientGraphs(): Promise<void> {
  const made = vite;
  vite = undefined;
  await (await made)?.close();
}

type AstNode = { readonly type: string; readonly [key: string]: unknown };

/** Every identifier name under `node`, the import declarations left out. */
function namesIn(node: unknown, out: Set<string>): Set<string> {
  if (Array.isArray(node)) {
    for (const child of node) namesIn(child, out);
  } else if (node !== null && typeof node === 'object') {
    const ast = node as AstNode;
    if (ast.type === 'ImportDeclaration') return out;
    if (ast.type === 'Identifier') out.add(ast['name'] as string);
    for (const value of Object.values(ast)) namesIn(value, out);
  }
  return out;
}

/**
 * The sources a browser module still needs once it is bundled: an import whose bindings
 * nothing uses is dropped by the bundler, and that is exactly what an erased
 * `serverValidator` leaves behind — the import of the data it read. A bare import and an
 * `export … from` are always kept.
 */
async function neededSources(code: string): Promise<Set<string>> {
  const { parseAstAsync } = await import('vite');
  const program = await parseAstAsync(code);
  const used = namesIn(program.body, new Set());
  const needed = new Set<string>();
  for (const statement of program.body as unknown as AstNode[]) {
    const source = (statement['source'] as { value?: string } | null | undefined)?.value;
    if (source === undefined) continue;
    const specifiers = (statement['specifiers'] as { local: { name: string } }[] | undefined) ?? [];
    const keeps =
      statement.type !== 'ImportDeclaration' ||
      specifiers.length === 0 ||
      specifiers.some((s) => used.has(s.local.name));
    if (keeps) needed.add(source);
  }
  return needed;
}

/**
 * The project files the client chunk of `file` reaches through its imports, transformed for
 * the browser and pruned as the bundler prunes. `ssr: true` walks the SSR transform instead,
 * where nothing is erased and nothing pruned: what the graph would be without the plugin.
 */
export async function walk(file: string, ssr: boolean): Promise<ClientGraph> {
  const vite = await server();
  const env = ssr ? vite.environments['ssr']! : vite.environments['client']!;
  const root = inject(ROOT_KEY);
  const seen = new Set<string>();
  const visit = async (url: string): Promise<void> => {
    const result = (await env.transformRequest(url))!;
    const needed = ssr ? undefined : await neededSources(result.code);
    const node = (await env.moduleGraph.getModuleByUrl(url))!;
    for (const imported of node.importedModules) {
      const at = imported.file;
      // A package is not the project's: what it imports cannot be a file of the project.
      if (at === null || seen.has(at) || at.includes('/node_modules/') || relative(root, at).startsWith('..')) continue;
      if (needed !== undefined && !needed.has(imported.url)) continue;
      seen.add(at);
      await visit(imported.url);
    }
  };
  await visit(`${file}?client`);
  return { files: [...seen].map((at) => relative(root, at).replace(/\\/gu, '/')).sort() };
}

/** What `component`'s client chunk takes to the browser. */
export function clientGraphOf(component: FudModule): Promise<ClientGraph> {
  return walk(component[FILE_EXPORT], false);
}

/** Whether `graph` reaches `path`, relative to the project root. */
export function reaches(graph: ClientGraph, path: string): boolean {
  const root = inject(ROOT_KEY);
  return graph.files.includes(relative(root, resolve(root, path)).replace(/\\/gu, '/'));
}
