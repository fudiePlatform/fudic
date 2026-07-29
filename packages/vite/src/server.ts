/**
 * The `?server` module (SDD-19 §4.3): the RenderChunk wrapper imports `load`/`paths`
 * from `<page>.fud?server`. This emits that module — the page's `@server` region(s)
 * verbatim, which is where the `export function load`/`paths` live. Server-only code
 * never reaches any client bundle because it is only ever imported by the WW chunk.
 */

import { type ServerRegion } from '@fudic/compiler';
import { parseFud } from './parse.js';

const EMPTY = 'export {};\n';

/**
 * Emit the `?server` module for a route: its `@server` region code, or an empty module.
 * Any role that can BE a route qualifies — a page (doctype) and a route fragment
 * (SDD-21), which carries its `@code` at the top level instead of inside `<head>`.
 */
export function emitServerModule(source: string): string {
  const doc = parseFud(source);
  const isRoute = doc.type === 'page-document' || doc.type === 'route-document';
  if (!isRoute || !doc.code) {
    return EMPTY;
  }
  const body = doc.code.parts
    .filter((p): p is ServerRegion => p.type === 'server-region')
    .map((p) => source.slice(p.js.start, p.js.end).trim())
    .filter((s) => s.length > 0)
    .join('\n\n');
  return body.length > 0 ? `${body}\n` : EMPTY;
}
