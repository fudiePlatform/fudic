/**
 * The life of a route is the life of its document. Navigating replaces the document, so a route
 * connects when it is up, disconnects on `pagehide`, and is destroyed when the page that hides
 * is not kept. One kept in the back-forward cache comes back on `pageshow` without having been
 * destroyed: for a page, what a keyed move is for a component.
 *
 * `pagehide` and `pageshow` and never `unload` or `beforeunload`: those take the page out of the
 * back-forward cache. And only for a route whose `@code` asked for them.
 */

import type { RouteController } from './chunks.js';

/** Connect `route`, and follow the page it lives in through `view`'s page transitions. */
export function followPage(route: RouteController, view: EventTarget): void {
  const { on, off } = route;
  if (on === undefined || off === undefined) return;
  on();
  view.addEventListener('pagehide', (event) => {
    off();
    if (!(event as PageTransitionEvent).persisted) route.r();
  });
  view.addEventListener('pageshow', (event) => {
    if ((event as PageTransitionEvent).persisted) on();
  });
}
