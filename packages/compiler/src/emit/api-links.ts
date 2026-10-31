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
import type { DataShape, Diagnostic } from '../types/index.js';
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

/**
 * The `load` of the route's own `.fudapi`, imported as `$load` from its browser variant: what the
 * chunk asks the server for its `data` again with (SDD-68 §4.8). Not under its own name — `load`
 * is not a name the `.fudapi` gives the `@code`, and the author may well have one of their own.
 */
export function loadImport(graph: ComponentGraph): string | undefined {
  const apis = 'serverApis' in graph ? (graph as DocumentGraph).serverApis : [];
  const own = apis.find((a) => a.api?.load === true)?.api;
  return own === undefined ? undefined : `import { load as $load } from ${JSON.stringify(`fudic:${own.id}`)};`;
}

/**
 * The shape of the route's `data`, as the host read it off its `load` (BUG-60 §3.1): what the
 * page writes `fud-data` with and the chunk reads it back with. Both ends ask this one function,
 * so a link the host could not read — no shape — leaves the block with its keys on both.
 */
export function dataShapeOf(graph: ComponentGraph): DataShape | undefined {
  const apis = 'serverApis' in graph ? (graph as DocumentGraph).serverApis : [];
  return apis.find((a) => a.api?.load === true)?.api?.data;
}

/**
 * The fields of `load` marked `later` (SDD-70 §3.1): promises when the page is painted, so they
 * are never part of what `fud-data` carries — they travel in the `fields` of their part.
 */
export function laterFieldsOf(graph: ComponentGraph): readonly string[] {
  const apis = 'serverApis' in graph ? (graph as DocumentGraph).serverApis : [];
  return apis.find((a) => a.api?.load === true)?.api?.later ?? [];
}

/**
 * The forms the `.fudapi` a file links give it, by name: stores from another module, which the
 * client subscribes to through what the markup reads (`userForm.$valid()`, BUG-42 §4.3) exactly
 * as it did when the form was an import of the `@code`. Functions are left out: a stub has
 * nothing to subscribe to.
 */
export function apiForms(graph: ComponentGraph): readonly string[] {
  const apis = 'serverApis' in graph ? (graph as DocumentGraph).serverApis : [];
  return [...new Set(apis.flatMap(({ api }) => (api === undefined ? [] : api.forms)))];
}
