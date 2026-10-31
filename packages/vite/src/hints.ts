/**
 * The early hints of a route (SDD-70 §3.10): what the page needs before its body, written into
 * the route manifest as `Link` values ready to send — as a `103 Early Hints` while `load` runs,
 * and on the final response.
 *
 * The manifest and not the render is where they live, because the backend is not always Node:
 * any server that reads `fudic-routes.json` sends the same hints without running a line of this
 * framework.
 */

import type { EarlyHint } from '@fudic/compiler';

/** One hint as the value of a `Link` header: `</x.css>; rel=preload; as=style`. */
export function linkValue(hint: EarlyHint): string {
  return `<${hint.href}>; rel=${hint.rel}${hint.as === undefined ? '' : `; as=${hint.as}`}`;
}

/**
 * The hints of one route, in the order the browser should ask: the sheets its head links (the
 * emit's), then the modules it loads at start — the entries and what they import statically, in
 * depth (the build's). An empty URL is an entry this page does not load, and it is skipped; a URL
 * named twice is hinted once.
 */
export function routeHints(sheets: readonly EarlyHint[], modules: readonly string[]): readonly string[] {
  const all = [
    ...sheets,
    ...modules.filter((href) => href !== '').map((href): EarlyHint => ({ href, rel: 'modulepreload' })),
  ];
  return [...new Set(all.map(linkValue))];
}
