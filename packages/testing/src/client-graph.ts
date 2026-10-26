/**
 * What a component takes to the browser (§3.10): the imports of its `?client` chunk, walked
 * with the plugin's CLIENT transform — the browser variant of every `fudic:<id>`, which loads
 * `src/browser` and never `src/server` — and without running any of it.
 *
 * The test's own graph cannot answer this: it runs every module through the SSR path, where
 * the server variant loads both folders (§4.1). So the walk has a Vite of its own, with the
 * project's plugin, made on the first call and kept for the rest of the file.
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

/** Whether `node` runs a call where it stands. */
function calls(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(calls);
  if (node === null || typeof node !== 'object') return false;
  const ast = node as AstNode;
  // A function or a class is defined, not run: what its body calls happens later, if ever.
  if (/^(?:ArrowFunctionExpression|FunctionExpression|FunctionDeclaration|ClassDeclaration|ClassExpression)$/u.test(ast.type)) return false;
  if (ast.type === 'CallExpression' || ast.type === 'NewExpression' || ast.type === 'TaggedTemplateExpression') return true;
  return Object.values(ast).some(calls);
}

/**
 * Whether a top-level statement may do something when its module is evaluated — which is
 * what keeps a module in a bundle even when nothing it exports is used. Conservative: only an
 * import, an `export … from`, a function or class declaration, and a declaration (exported or
 * not) whose initializers call nothing, are known to do nothing.
 */
function hasEffect(statement: AstNode): boolean {
  switch (statement.type) {
    case 'ImportDeclaration':
    case 'ExportAllDeclaration':
    case 'FunctionDeclaration':
    case 'ClassDeclaration':
      return false;
    case 'ExportNamedDeclaration':
      return statement['declaration'] !== null && hasEffect(statement['declaration'] as AstNode);
    case 'ExportDefaultDeclaration':
      return calls(statement['declaration']);
    case 'VariableDeclaration':
      return calls(statement['declarations']);
    default:
      return true;
  }
}

/** What the walk needs to know about one browser module, read in one pass of the parser. */
interface ModuleFacts {
  /**
   * The sources it still needs once bundled: an import whose names nothing uses after the
   * client transform is one the bundler drops. A bare import and an `export … from` are
   * always needed.
   */
  readonly needed: ReadonlySet<string>;
  /** Whether evaluating it may do something (see `hasEffect`). */
  readonly effects: boolean;
}

/** Exported for its tests: the rules are easier to read one statement at a time. */
export async function factsOf(code: string): Promise<ModuleFacts> {
  const { parseAstAsync } = await import('vite');
  const program = await parseAstAsync(code);
  const body = program.body as unknown as AstNode[];
  const used = namesIn(body, new Set());
  const needed = new Set<string>();
  for (const statement of body) {
    const source = (statement['source'] as { value?: string } | null | undefined)?.value;
    if (source === undefined) continue;
    const specifiers = (statement['specifiers'] as { local: { name: string } }[] | undefined) ?? [];
    const keeps =
      statement.type !== 'ImportDeclaration' ||
      specifiers.length === 0 ||
      specifiers.some((s) => used.has(s.local.name));
    if (keeps) needed.add(source);
  }
  return { needed, effects: body.some(hasEffect) };
}

/**
 * The project files the client chunk of `file` reaches through its imports, transformed for
 * the browser and pruned as the bundler prunes (decision 8.1.23): an import whose names nothing
 * uses any more is followed only when the module it names has top-level effects, because a
 * bundler keeps that module whole.
 */
async function walk(file: string): Promise<ClientGraph> {
  const vite = await server();
  const env = vite.environments['client']!;
  const root = inject(ROOT_KEY);
  const facts = new Map<string, Promise<ModuleFacts>>();
  const factsAt = (url: string): Promise<ModuleFacts> => {
    let found = facts.get(url);
    if (found === undefined) {
      found = env.transformRequest(url).then((result) => factsOf(result!.code));
      facts.set(url, found);
    }
    return found;
  };
  const seen = new Set<string>();
  const visit = async (url: string): Promise<void> => {
    const { needed } = await factsAt(url);
    const node = (await env.moduleGraph.getModuleByUrl(url))!;
    for (const imported of node.importedModules) {
      const at = imported.file;
      // A package is not the project's: what it imports cannot be a file of the project.
      if (at === null || seen.has(at) || at.includes('/node_modules/') || relative(root, at).startsWith('..')) continue;
      if (!needed.has(imported.url) && !(await factsAt(imported.url)).effects) continue;
      seen.add(at);
      await visit(imported.url);
    }
  };
  await visit(`${file}?client`);
  return { files: [...seen].map((at) => relative(root, at).replace(/\\/gu, '/')).sort() };
}

/** What `component`'s client chunk takes to the browser. */
export function clientGraphOf(component: FudModule): Promise<ClientGraph> {
  return walk(component[FILE_EXPORT]);
}

/** Whether `graph` reaches `path`, relative to the project root. */
export function reaches(graph: ClientGraph, path: string): boolean {
  const root = inject(ROOT_KEY);
  return graph.files.includes(relative(root, resolve(root, path)).replace(/\\/gu, '/'));
}
