/**
 * The `@`-construct parsers of the language, in one object.
 *
 * SDD-05 parses HTML and delegates every `@`-construct through `AtConstructParser` (the seam
 * that keeps the dependency graph acyclic). WHICH parsers are injected was, until SDD-29,
 * copied into five hosts — the compiler's own resolver, the CLI, the formatter, the language
 * server and the Vite plugin — and a construct added to the language had to be remembered in
 * all five. A host that forgets one does not fail to build: it silently parses a construct as
 * `FUD0055`, and only in that host, which is the shape of defect that costs a day to find.
 *
 * So the set lives here, once, and every host spreads it.
 */

import { parseControl } from './control/index.js';
import { parseCodeBlock } from './code/index.js';
import { parseDirective } from './layout/index.js';
import { parseSnippet } from './snippet/index.js';
import type { AtConstructParser } from './html/index.js';

/** Every `@`-construct parser this compiler has. Hosts inject this and nothing else. */
export const atConstructs: AtConstructParser = {
  parseControl,
  parseCodeBlock,
  parseDirective,
  parseSnippet,
};
