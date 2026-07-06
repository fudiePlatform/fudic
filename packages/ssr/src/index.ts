/**
 * Entry point of `@fudic/ssr`.
 *
 * The build adapter of the fudic runtime (SDD-14): `SsrDom` implements the
 * construction contract `Dom<SsrNode>` over a detached tree, and `renderToString`
 * serializes that tree to HTML with Declarative Shadow DOM. No hydration, no
 * reactive mutation — those live in the browser (`@fudic/dom` · `@fudic/core`).
 */

export const VERSION = '0.0.1';

export { type SsrNode } from './tree.js';
export { SsrDom } from './ssr-dom.js';
export { renderToString } from './serialize.js';
