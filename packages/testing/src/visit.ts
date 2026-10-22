/**
 * `visit`: one route, painted as `vite dev` paints it (§3.7, §4.9).
 *
 * The URL is matched with the plugin's routing, the page is drained through the plugin's own
 * wrapper with `load` imported by vitest's graph — or handed `data` in its place — and what
 * `load` or `layout` throws is answered as the dev server answers it: `_error.fud` with the
 * status of the problem. The HTML becomes the whole document, its declarative shadow roots
 * applied, and hydration is installed over it.
 */

import { classifyError, renderErrorPage, matchRouteBuild } from '@fudic/vite/harness';
import { serverRoot } from './api.js';
import { showPage } from './document.js';
import { graphOf } from './graph.js';
import { chunkMap, hydrate } from './hydrate.js';
import { loadWrapper, renderPage, routeFacts } from './page.js';
import { settled } from './pending.js';
import { projectOf } from './project.js';
import type { ProviderOverride } from './providers.js';
import { knowComponents } from './server.js';
import { enterWorld, harnessOf, type Harness, type WorldOptions } from './session.js';

export interface VisitOptions extends WorldOptions {
  /** Takes the place of what `load` returns. `layout(ctx, data)` runs all the same, with it. */
  readonly data?: unknown;
}

export interface Visited extends Harness {
  /** The whole page: `<html>`, `<head>` and `<body>`. */
  readonly document: Document;
  /** The status the dev server would answer with. */
  readonly status: number;
}

/** The path of `url` inside the app: its query dropped and `base` stripped, as `vite dev` reads it. */
function pathnameOf(url: string, base: string): string {
  const path = url.split('?')[0]!;
  return path.startsWith(base) ? path.slice(base.length - 1) : path;
}

/** The page the dev server answers for `url`, with its status. */
async function answer(url: string, data: unknown): Promise<{ html: string; status: number; file: string }> {
  const { base, routes, errorPage, httpFile } = projectOf();
  const pathname = pathnameOf(url, base);
  const rb = matchRouteBuild(routes, pathname);
  if (rb === null) throw new Error(`visit('${url}'): no route matches ${pathname}`);
  knowComponents(graphOf(rb.absPath).components.values());
  try {
    return { html: await renderPage(rb.absPath, routeFacts(rb, httpFile), rb.route.pattern, pathname, data), status: 200, file: rb.absPath };
  } catch (error) {
    const failure = classifyError(error, true);
    if (failure.kind === 'redirect') {
      throw new Error(`visit('${url}'): redirected with ${failure.status} to ${failure.location} — visit that URL instead`);
    }
    if (errorPage === undefined) {
      return { html: await renderErrorPage(null, failure.problem, ''), status: failure.problem.status, file: rb.absPath };
    }
    knowComponents(graphOf(errorPage.absPath).components.values());
    const mod = await loadWrapper(errorPage.absPath, routeFacts(errorPage, httpFile));
    return { html: await renderErrorPage(mod, failure.problem, ''), status: failure.problem.status, file: errorPage.absPath };
  }
}

/**
 * Make `html` — a whole page — the document, hydration installed over the components of
 * `file`, and hand back the page with `status`.
 */
export async function showDocument(
  html: string,
  file: string,
  status: number,
  providers: readonly ProviderOverride[],
): Promise<Visited> {
  const body = showPage(html);
  hydrate(body, chunkMap(graphOf(file).components.values()), providers);
  await settled();
  // Onto the harness, not spread from it: `invalidated` is a getter, and a spread would freeze it.
  return Object.assign(harnessOf(document), { document, status });
}

/** Visit `url` and hand back the page a test reads and drives. */
export async function visit(url: string, options: VisitOptions = {}): Promise<Visited> {
  const providers = enterWorld(options, url);
  await serverRoot();
  const { html, status, file } = await answer(url, options.data);
  return showDocument(html, file, status, providers);
}
