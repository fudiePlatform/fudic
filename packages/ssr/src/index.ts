/**
 * Entry point of `@fudic/ssr`.
 *
 * The build adapter of the fudic runtime (SDD-14 + SDD-16): `SsrDom` implements
 * the construction contract `Dom<SsrNode>` over a detached tree; one lazy walk
 * (`serializeChunks`) serializes that tree to HTML with Declarative Shadow DOM,
 * joined by `renderToString` or encoded by `renderToStream`/`htmlToByteStream`
 * with platform backpressure. No hydration, no reactive mutation — those live
 * in the browser (`@fudic/dom` · `@fudic/core`).
 */

export const VERSION = '0.0.1';

export { type SsrNode } from './tree.js';
export { SsrDom } from './ssr-dom.js';
export {
  renderToString,
  serializeChunks,
  escapeText,
  escapeAttr,
  neutralizeComment,
} from './serialize.js';
export { renderToStream, htmlToByteStream, type StreamOptions } from './stream.js';
