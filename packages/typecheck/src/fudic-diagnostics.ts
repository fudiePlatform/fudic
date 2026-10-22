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
import { serverLinksOf } from './links.js';
import { hrefDiagnostics } from './href.js';
import type { LinkIndex } from './link-index.js';
import type { ProjectedFud } from './project.js';
import { reservedDollarDiagnostics } from './reserved-dollar.js';

/**
 * What the semantic pass may ask about another component: whether the tag is declared, and
 * nothing else.
 *
 * `propsOf` is deliberately absent. The contract of a child — its props, required or not, and
 * its slots — is TypeScript's to check over the projection, with more to say than a fudic rule:
 * `<site-nav .currnt=>` is `TS2561`, which knows the name was meant to be `current`. The three
 * fudic rules that used to say it too (`FUD0197`–`FUD0199`) were retired by SDD-35. One voice
 * per fact — the rule BUG-23 spent a month learning.
 */
function registryOf(document: ProjectedFud): ComponentRegistry {
  return { has: (tag) => document.registry.component(tag) !== undefined };
}

/**
 * What the `.fudapi` the document links bring into its view (SDD-60 §3.14): `undefined` when it
 * links none, or when one of them could not be read — the caller cannot know, and the view then
 * keeps the rule of its role.
 */
function apisOf(document: ProjectedFud): { readonly data: boolean; readonly names: ReadonlySet<string> } | undefined {
  const links = serverLinksOf(document.document).length;
  const servers = document.registry.servers();
  if (links === 0 || servers.length < links) return undefined;
  return { data: servers.some((s) => s.load), names: new Set(servers.flatMap((s) => s.names)) };
}

/** The semantic pass over the document already parsed. */
export function semanticDiagnostics(document: ProjectedFud): readonly Diagnostic[] {
  const apis = apisOf(document);
  return analyze({
    source: document.source,
    document: document.document,
    js: document.js.result,
    fragmentId: (node) => document.js.fragmentId(node),
    components: registryOf(document),
    ...(apis === undefined ? {} : { apis }),
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
