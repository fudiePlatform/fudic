/**
 * What the `.fudapi` a file links say about the file (SDD-60 §3.14), checked once the graph
 * is resolved: only it has the facts of each link side by side with the file's `@code`.
 *
 * - `FUD1113`: a name two linked files give, or one the `@code` declares again.
 * - `FUD1005` / `FUD1006`: `form:=` sends to a function of a linked file — the same check
 *   `extractCode` runs against `@server` for a file that links none.
 *
 * A link the host could not read leaves the names unknown, and both checks then stay silent:
 * saying «not a function» about a file nobody read would be a guess.
 */

import { FUD1113 } from '@fudic/diagnostics';
import type { Diagnostic } from '../types/index.js';
import { formSendDiagnostics } from './controls.js';
import { codeOfDocument, templateRootsOf } from './oxc-code.js';
import type { DocumentGraph } from './resolve.js';

export function apiDiagnostics(graph: DocumentGraph): readonly Diagnostic[] {
  const entry = graph.entry;
  const apis = graph.serverApis;
  if (apis.length === 0 || (entry.type !== 'component-document' && entry.type !== 'route-document' && entry.type !== 'page-document')) {
    return [];
  }
  const out: Diagnostic[] = [];
  const declared = new Set(codeOfDocument(graph.entrySource, entry).declared);
  const givenBy = new Map<string, string>();
  const forms = new Set(apis.flatMap((a) => a.api?.forms ?? []));
  for (const { link, href, api } of apis) {
    if (api === undefined) continue;
    const names = new Set([...(api.load ? ['data'] : []), ...api.functions, ...api.forms]);
    for (const name of names) {
      const other = givenBy.get(name);
      // A form is a name of the project, one per project (`FUD1081`): two files that both bring
      // `userForm` bring the same form.
      if (other !== undefined && api.forms.includes(name) && forms.has(name)) continue;
      if (other !== undefined) out.push(FUD1113({ span: link.span, name, other }));
      else if (declared.has(name)) out.push(FUD1113({ span: link.span, name }));
      else givenBy.set(name, href);
    }
  }
  if (apis.every((a) => a.api !== undefined)) {
    const functions = new Set(apis.flatMap((a) => a.api!.functions));
    out.push(...formSendDiagnostics(graph.entrySource, templateRootsOf(entry), functions));
  }
  return out;
}
