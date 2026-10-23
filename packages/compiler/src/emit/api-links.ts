/**
 * What the `.fudapi` a file links say about the file (SDD-60 §3.14), checked once the graph
 * is resolved: only it has the facts of each link side by side with the file's `@code`.
 *
 * - `FUD1113`: a name two linked files give, or one the `@code` declares again.
 * - `FUD1005` / `FUD1006`: `form:=` sends to a function of a linked file — the same check
 *   `extractCode` runs, against no function at all, for a file that links none.
 *
 * A link the host could not read leaves the names unknown, and both checks then stay silent:
 * saying «not a function» about a file nobody read would be a guess.
 */

import { FUD1113 } from '@fudic/diagnostics';
import type { Diagnostic } from '../types/index.js';
import { formSendDiagnostics } from './controls.js';
import { codeOfDocument, templateRootsOf } from './oxc-code.js';
import type { ComponentGraph, DocumentGraph } from './resolve.js';

export function apiDiagnostics(graph: DocumentGraph): readonly Diagnostic[] {
  const entry = graph.entry;
  const apis = graph.serverApis;
  if (apis.length === 0 || (entry.type !== 'component-document' && entry.type !== 'route-document' && entry.type !== 'page-document')) {
    return [];
  }
  const out: Diagnostic[] = [];
  const declared = new Set(codeOfDocument(graph.entrySource, entry).declared);
  const givenBy = new Map<string, { readonly href: string; readonly form: boolean }>();
  for (const { link, href, api } of apis) {
    if (api === undefined) continue;
    const names = new Set([...(api.load ? ['data'] : []), ...api.functions, ...api.forms]);
    for (const name of names) {
      const other = givenBy.get(name);
      const form = api.forms.includes(name);
      // A form is a name of the project, one per project (`FUD1081`): two files that both bring
      // `userForm` as a form bring the same form.
      if (other !== undefined && !(other.form && form)) out.push(FUD1113({ span: link.span, name, other: other.href }));
      else if (other === undefined && declared.has(name)) out.push(FUD1113({ span: link.span, name }));
      else if (other === undefined) givenBy.set(name, { href, form });
    }
  }
  if (apis.every((a) => a.api !== undefined)) {
    const functions = new Set(apis.flatMap((a) => a.api!.functions));
    out.push(...formSendDiagnostics(graph.entrySource, templateRootsOf(entry), functions));
  }
  return out;
}

/**
 * What the `.fudapi` a file links give its browser code (SDD-60 §3.14, §4.3): its functions and
 * its forms, imported from the browser variant of `fudic:<id>` — the stub of each function is
 * that module's, not one written here. A name two files give is imported once: `FUD1113` has
 * already said whether that is a mistake. A link the host could not read gives nothing.
 */
export function apiImports(graph: ComponentGraph): readonly string[] {
  const apis = 'serverApis' in graph ? (graph as DocumentGraph).serverApis : [];
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const { api } of apis) {
    if (api === undefined) continue;
    const names = [...api.functions, ...api.forms].filter((name) => !seen.has(name));
    for (const name of names) seen.add(name);
    if (names.length > 0) lines.push(`import { ${names.join(', ')} } from ${JSON.stringify(`fudic:${api.id}`)};`);
  }
  return lines;
}
