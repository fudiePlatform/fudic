/**
 * The delegated leaves (SDD-26 §4.1–§4.3). Canonical re-export: everything that leaves this
 * package's own printer goes through here, and nowhere else.
 */

export { oxfmtEngine, type LeafEngine, type LeafLanguage, type LeafOutput, type LeafRequest } from './engine.js';
export { dedent, formatJsFragment, unwrapFragment, wrapFragment, type JsFragmentKind } from './js.js';
export { formatStyleBody, type CssLeafResult } from './css.js';
export { collectLeaves, LeafTable } from './collect.js';
