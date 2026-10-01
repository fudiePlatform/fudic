/**
 * Every `FUD` diagnostic of one document, as the editor publishes it and the build reports it
 * (SDD-24 §4.4, SDD-35 §4.3).
 *
 * Parse, structure, Oxc syntax and the semantic pass of SDD-12 all report with a span over the
 * `.fud`, which is the coordinate system both want. Nothing is re-implemented and nothing is
 * translated: an error one of them reports and the other does not is the failure mode this
 * function exists to prevent.
 *
 * The semantic pass runs over the AST and the Oxc batch the projection already holds, so asking
 * for diagnostics costs no parse.
 */

import { analyze, type ComponentRegistry, type Diagnostic } from '@fudic/compiler';
import { holeDiagnostics } from './holes.js';
import { hrefDiagnostics } from './href.js';
import type { LinkIndex } from './link-index.js';
import type { ProjectedFud } from './project.js';
import { reservedDollarDiagnostics } from './reserved-dollar.js';

/**
 * What the semantic pass may ask about another component: whether the tag is declared, and
 * nothing else.
 *
 * `propsOf` and `slotsOf` are deliberately absent, and the reason was measured rather than
 * assumed. Supplying them turns on the two contract rules of BUG-23 — the required prop nobody
 * passes, the slot the parent does not declare — and both are already reported by TypeScript
 * over the projection, with more to say: `<site-nav .currnt=>` came back as `TS2561` *and*
 * `FUD0198`, the same mistake said twice, and only one of the two knows the name was meant to
 * be `current`. One voice per fact — the rule BUG-23 spent a month learning.
 */
function registryOf(document: ProjectedFud): ComponentRegistry {
  return { has: (tag) => document.registry.component(tag) !== undefined };
}

/** The semantic pass over the document already parsed. */
export function semanticDiagnostics(document: ProjectedFud): readonly Diagnostic[] {
  return analyze({
    source: document.source,
    document: document.document,
    js: document.js.result,
    fragmentId: (node) => document.js.fragmentId(node),
    components: registryOf(document),
  }).diagnostics;
}

/**
 * Every `FUD` diagnostic of one document: the compiler's, plus the rules no other layer can
 * see — an `href` that resolves to nothing, a route against its layout's holes, the reserved
 * `$`.
 *
 * The type errors are NOT here — they come from TypeScript over the projection, mapped back
 * by Volar.
 */
export function fudicDiagnostics(document: ProjectedFud, index: LinkIndex): readonly Diagnostic[] {
  return [
    ...document.diagnostics,
    ...semanticDiagnostics(document),
    ...hrefDiagnostics(document, index),
    ...holeDiagnostics(document, index),
    ...reservedDollarDiagnostics(document),
  ];
}
