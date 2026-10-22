/**
 * Server functions in the plugin (SDD-56 §4.15): served by the dev server and by `vite
 * preview`, and bundled by the build into `.fudic/edge/functions.mjs`.
 *
 * Where a request goes is `@fudic/http/server`'s `functionsHandler`, in all three: this module
 * only says where the modules are — loaded on demand in dev, imported by the generated module
 * in a build — and carries a Node request into a `Request` and a `Response` back out.
 */

import { existsSync, readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extractCode } from '@fudic/compiler';
import { FN_PREFIX, LEGACY_HTTP_FILE } from '@fudic/conventions';
import type { RouteBuild } from './discover.js';
import { parseFud } from './parse.js';

/** Whether `pathname` is a server function's URL, `base` included. */
export function isFnPath(pathname: string, base: string): boolean {
  return pathname.startsWith(`${base.replace(/\/$/u, '')}/_fudic/fn/`);
}

/**
 * A Node request as a `Request`, whose `signal` aborts when the client goes away before the
 * response is written (§4.12).
 */
export function toRequest(req: IncomingMessage, res: ServerResponse): Request {
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) controller.abort();
  });
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    for (const one of Array.isArray(value) ? value : [value]) headers.append(name, one);
  }
  const method = req.method ?? 'GET';
  const body = method === 'GET' || method === 'HEAD' ? undefined : (Readable.toWeb(req) as ReadableStream);
  // `originalUrl`: Connect's, with the app's `base` still on it.
  const path = (req as IncomingMessage & { readonly originalUrl?: string }).originalUrl ?? req.url ?? '/';
  return new Request(new URL(path, `http://${req.headers.host ?? 'localhost'}`), {
    method,
    headers,
    signal: controller.signal,
    ...(body !== undefined ? { body, duplex: 'half' } : {}),
  } as RequestInit);
}

/**
 * A `Response`, written to a Node response. `set-cookie` keeps its several values. `null` is
 * the handler's «not mine», and the request goes on to `next`.
 */
export async function sendResponse(res: ServerResponse, response: Response | null, next: () => void): Promise<void> {
  if (response === null) {
    next();
    return;
  }
  res.statusCode = response.status;
  response.headers.forEach((value, name) => {
    if (name !== 'set-cookie') res.setHeader(name, value);
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) res.setHeader('set-cookie', cookies);
  res.end(Buffer.from(await response.arrayBuffer()));
}

/**
 * `@fudic/http/server`'s `functionsHandler`, as the plugin calls it. Typed here: the plugin
 * loads it out of the project's own graph and does not depend on the package.
 */
export type FunctionsHandler = (
  source: ReturnType<typeof devSource>,
  options: {
    readonly base: string;
    readonly dev: boolean;
    readonly onError: (error: unknown) => void;
  },
) => (request: Request) => Promise<Response | null>;

/** The server root's `handler` (SDD-60 §4.4), as the plugin calls it out of the dev graph. */
export type ContractsHandler = (options: {
  readonly base: string;
  readonly dev: boolean;
  readonly onError: (error: unknown) => void;
}) => (request: Request) => Promise<Response | null>;

/** `src/http.ts` of the project, when it has one. */
export function httpFileOf(root: string): string | undefined {
  const file = `${root.replace(/\\/gu, '/')}/${LEGACY_HTTP_FILE}`;
  return existsSync(file) ? file : undefined;
}

/** What the dev server's `functionsHandler` reads modules through. */
export interface DevModules {
  readonly builds: readonly RouteBuild[];
  /** A component's `.fud`, by tag. */
  componentPath(tag: string): string | undefined;
  load(id: string): Promise<Record<string, unknown>>;
  readonly httpFile: string | undefined;
}

/** The `FnSource` of the dev server: modules loaded through Vite's SSR graph, on demand. */
export function devSource(modules: DevModules) {
  const serverOf = async (path: string | undefined) =>
    path === undefined ? undefined : await modules.load(`${path.replace(/\\/gu, '/')}?server`);
  return {
    routes: modules.builds.map((rb) => rb.route.pattern),
    route: (pattern: string) => serverOf(modules.builds.find((rb) => rb.route.pattern === pattern)?.absPath),
    component: (tag: string) => serverOf(modules.componentPath(tag)),
    global: async () =>
      modules.httpFile === undefined ? undefined : (await modules.load(modules.httpFile))['default'],
  };
}

/** The server functions a `.fud` exposes — `load` aside — by name and method. */
export function functionsOf(path: string): readonly { readonly name: string; readonly method: string }[] {
  const source = readFileSync(path, 'utf8');
  const doc = parseFud(source);
  if (doc.type !== 'page-document' && doc.type !== 'route-document' && doc.type !== 'component-document') {
    return [];
  }
  return extractCode(source, doc)
    .serverFns.fns.filter((fn) => fn.name !== 'load')
    .map((fn) => ({ name: fn.name, method: fn.method }));
}

/** Every file of the app with server functions, and the table an adapter mounts them by. */
export function appFunctions(
  builds: readonly RouteBuild[],
  components: readonly { readonly tag: string; readonly path: string }[],
): {
  readonly routes: { readonly pattern: string; readonly path: string }[];
  readonly components: { readonly tag: string; readonly path: string }[];
  readonly table: { readonly url: string; readonly method: string }[];
} {
  const table: { url: string; method: string }[] = [];
  const routes = builds.flatMap((rb) => {
    const fns = functionsOf(rb.absPath);
    const prefix = `${FN_PREFIX}/r${rb.route.pattern === '/' ? '' : rb.route.pattern}`;
    for (const fn of fns) table.push({ url: `${prefix}/${fn.name}`, method: fn.method });
    return fns.length === 0 ? [] : [{ pattern: rb.route.pattern, path: rb.absPath }];
  });
  const owners = components.flatMap((c) => {
    const fns = functionsOf(c.path);
    for (const fn of fns) table.push({ url: `${FN_PREFIX}/c/${c.tag}/${fn.name}`, method: fn.method });
    return fns.length === 0 ? [] : [{ tag: c.tag, path: c.path }];
  });
  return { routes, components: owners, table };
}

/** The `.fudic/edge/functions.mjs` module: every `?server` of the app behind one handler. */
export function emitFunctionsModule(input: {
  readonly routes: readonly { readonly pattern: string; readonly path: string }[];
  readonly components: readonly { readonly tag: string; readonly path: string }[];
  readonly httpFile: string | undefined;
  readonly base: string;
  /** Each function's URL and method, for the table an adapter mounts. */
  readonly table: readonly { readonly url: string; readonly method: string }[];
  /**
   * The functions of the `.fudapi` (SDD-60 §4.4): the id of the server root, whose `handler`
   * answers them, tried before the `?server` modules. Absent in a project without `.fudapi`.
   */
  readonly api?: string;
}): string {
  const server = (path: string): string => JSON.stringify(`${path.replace(/\\/gu, '/')}?server`);
  const lines = ["import { functionsHandler } from '@fudic/http/server';"];
  if (input.api !== undefined) lines.push(`import { handler as $api } from ${JSON.stringify(input.api)};`);
  if (input.httpFile !== undefined) lines.push(`import $global from ${JSON.stringify(input.httpFile)};`);
  lines.push('const routes = {');
  for (const r of input.routes) lines.push(`  ${JSON.stringify(r.pattern)}: () => import(${server(r.path)}),`);
  lines.push('};');
  lines.push('const components = {');
  for (const c of input.components) lines.push(`  ${JSON.stringify(c.tag)}: () => import(${server(c.path)}),`);
  lines.push('};');
  lines.push(
    'const source = {',
    '  routes: Object.keys(routes),',
    '  route: async (pattern) => routes[pattern]?.(),',
    '  component: async (tag) => components[tag]?.(),',
    `  global: async () => ${input.httpFile !== undefined ? '$global' : 'undefined'},`,
    '};',
    '/** Every server function of the app: a `Request` in, a `Response` out, `null` when not ours. */',
    ...(input.api === undefined
      ? [`export const handle = functionsHandler(source, { base: ${JSON.stringify(input.base)} });`]
      : [
          `const $legacy = functionsHandler(source, { base: ${JSON.stringify(input.base)} });`,
          `const $contracts = $api({ base: ${JSON.stringify(input.base)} });`,
          'export const handle = async (request) => (await $contracts(request)) ?? $legacy(request);',
        ]),
    '/** Each function by URL pattern and method, for an adapter to mount. */',
    `export const functions = ${JSON.stringify(input.table)}.map((entry) => ({ ...entry, handle }));`,
  );
  return `${lines.join('\n')}\n`;
}
