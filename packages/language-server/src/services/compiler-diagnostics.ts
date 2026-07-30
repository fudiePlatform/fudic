/**
 * The diagnostics the compiler already produces, forwarded as they are (SDD-24 §4.4).
 *
 * Parse, structure, Oxc syntax and the semantic pass of SDD-12 all report with a span over the
 * `.fud`, which is the coordinate system the editor wants. Nothing is re-implemented and
 * nothing is translated: an error the CLI reports and the editor does not — or the other way
 * round — is the failure mode this function exists to prevent.
 *
 * The semantic pass runs over the AST and the Oxc batch the cache already holds, so asking for
 * diagnostics costs no parse.
 */

import { analyze, type ComponentRegistry, type Diagnostic } from '@fudic/compiler';
import type { CachedDocument } from '../document-cache.js';
import type { WorkspaceIndex } from '../workspace-index.js';
import { hrefDiagnostics } from './href.js';
import { reservedDollarDiagnostics } from './reserved-dollar.js';

/** Whether a tag is declared by this file, in the yes/no shape SDD-12 asks for. */
function registryOf(document: CachedDocument): ComponentRegistry {
  return { has: (tag) => document.registry.component(tag) !== undefined };
}

/** The semantic pass over the document the cache already parsed. */
export function semanticDiagnostics(document: CachedDocument): readonly Diagnostic[] {
  return analyze({
    source: document.source,
    document: document.document,
    js: document.js.result,
    fragmentId: (node) => document.js.fragmentId(node),
    components: registryOf(document),
  }).diagnostics;
}

/**
 * Every diagnostic the server owns for one document: the compiler's, plus the two rules of
 * §4.4 that no other layer can see.
 *
 * The type errors are NOT here — they come from the TypeScript service over the projection,
 * routed back through the mapping by Volar.
 */
export function fudicDiagnostics(
  document: CachedDocument,
  index: WorkspaceIndex,
): readonly Diagnostic[] {
  return [
    ...document.diagnostics,
    ...semanticDiagnostics(document),
    ...hrefDiagnostics(document, index),
    ...reservedDollarDiagnostics(document),
  ];
}
