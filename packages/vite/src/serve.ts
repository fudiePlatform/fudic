/**
 * What the plugin still knows about rendering a route (SDD-20 §4.11), now that serving it is
 * `@fudic/server`'s (SDD-81 §3.10): the graph dev checks before it renders, the match against
 * the dev server's own route table, and the render the prerender and the test harness call
 * with a module of their own.
 *
 * Pure and Vite-free: the module loader is INJECTED.
 */

import { resolveDocument, type ResolveIo } from '@fudic/compiler';
import {
  drainStream,
  edgeContext,
  matchesPattern,
  pageData,
  withRequest,
  type PendingResponse,
  type RenderModule,
} from '@fudic/server';
import { type RouteBuild } from './discover.js';

export { drainStream, edgeContext, openStream, paramsOf, readsSession, withRequest } from '@fudic/server';
export type { OpenedPage, PendingResponse, RenderModule } from '@fudic/server';

/**
 * Every `.fud` a route's page is made of: the route, its layout, every component either of
 * them reaches, and every snippet file (SDD-35 §4.5). The dev server refuses to render the page
 * while one of them has an error — the graph the build compiles, read by the same resolver.
 */
export function documentFiles(entry: string, io: ResolveIo): readonly string[] {
  const graph = resolveDocument(entry, io).value;
  return [
    graph.entryPath,
    ...graph.layouts.map((layout) => layout.path),
    ...[...graph.components.values()].map((component) => component.path),
    ...graph.snippetFiles,
  ];
}

/** Injected loader: import a module id through the host's SSR module graph. */
export type ModuleLoader = (id: string) => Promise<RenderModule>;

/**
 * The route whose pattern matches `pathname`, or `null`. `builds` is already ordered by
 * descending specificity, so the FIRST hit wins — the same first-hit rule the runtime
 * manifest matcher uses, kept identical on purpose.
 */
export function matchRouteBuild(builds: readonly RouteBuild[], pathname: string): RouteBuild | null {
  return builds.find((rb) => rb.decision.mode !== 'excluded' && matchesPattern(rb.route.pattern, pathname)) ?? null;
}

/** A fresh one, for one render or one data request outside a server: the prerender's. */
export const pendingResponse = (): PendingResponse => ({ status: 200, headers: new Headers() });

/** Load a route's wrapper module and render one concrete URL to an HTML string. */
export async function renderRouteHtml(
  load: ModuleLoader,
  wrapperId: string,
  pattern: string,
  url: string,
  nonce: string,
  request?: Request,
  response?: PendingResponse,
  onError?: (error: unknown) => void,
): Promise<string> {
  const mod = await load(wrapperId);
  const ctx = withRequest(edgeContext(pattern, url, nonce), request, response);
  return drainStream(mod.render(onError === undefined ? ctx : { ...ctx, onError }));
}

/** Run a route's `@server load(ctx)` for one concrete URL — the data endpoint (§4.5). */
export async function loadRouteData(
  load: ModuleLoader,
  wrapperId: string,
  pattern: string,
  url: string,
  request?: Request,
  response?: PendingResponse,
): Promise<ReadableStream<Uint8Array> | null> {
  return pageData(await load(wrapperId), pattern, url, request, response ?? pendingResponse());
}
