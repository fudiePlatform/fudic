/**
 * `renderLayout`: a layout without a route of the project (§3.8, §4.9).
 *
 * The harness writes the smallest route that uses it — its head contribution, its sections and
 * its body verbatim, and the props a route's `@server layout(ctx, data)` resolves — and paints
 * it as `visit` paints a route. The shell, the slots and the defaults are the layout's own.
 */

import { nodeIo, routeUsesDi } from '@fudic/vite/harness';
import { cached } from './cache.js';
import { FILE_EXPORT } from './constants.js';
import { layoutHost } from './host.js';
import type { FudModule } from './mount.js';
import { renderPage } from './page.js';
import { projectOf } from './project.js';
import { knowComponents } from './server.js';
import { graphOf } from './graph.js';
import { enterWorld, type WorldOptions } from './session.js';
import { showDocument, type Visited } from './visit.js';

export interface LayoutOptions extends WorldOptions {
  /** The layout's props. Without them, each takes its default. */
  readonly props?: Readonly<Record<string, unknown>>;
  /** HTML for `@RenderBody()`. */
  readonly body?: string;
  /** HTML for each `@RenderSection(name)`. */
  readonly sections?: Readonly<Record<string, string>>;
  /** HTML the route contributes to `@RenderHead()`. */
  readonly head?: string;
}

/** Paint `layout` around what `options` hands it, and hand back the page. */
export async function renderLayout(layout: Pick<FudModule, typeof FILE_EXPORT>, options: LayoutOptions = {}): Promise<Visited> {
  const providers = enterWorld(options, '/');
  const { props, body, sections, head } = options;
  const page = cached(
    'layout',
    'fud',
    layoutHost({ layout: layout[FILE_EXPORT], props, body, sections, head }),
  );
  knowComponents(graphOf(page).components.values());
  const { httpFile } = projectOf();
  const html = await renderPage(
    page,
    {
      hasLoad: false,
      hasLayout: props !== undefined,
      hasDi: routeUsesDi(page, nodeIo()),
      ...(httpFile === undefined ? {} : { globalChain: httpFile }),
    },
    '/',
    '/',
  );
  return showDocument(html, page, 200, providers);
}
