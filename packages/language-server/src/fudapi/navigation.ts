/**
 * Hover and go-to-definition in a `.fudapi` (SDD-60 §4.9). Both ask what project name the
 * cursor is on and find its declaration, in this file, another of the app or a library's
 * `fudapi/`. The hover shows the declaration as it is written — its signature, with what a
 * middleware `adds` — its documentation and where it comes from; the definition opens it.
 */

import type { ApiSource, Declared, ProjectDecls, ProjectKind } from '@fudic/api';
import type { Hover, LocationLink } from 'vscode-languageserver-protocol';
import { pathToUri } from '../uri.js';
import { rangeOf, touches, type ApiDocument } from './document.js';
import type { ApiHost } from './host.js';
import { apiRefs, type ApiRef } from './refs.js';

/**
 * The name under the cursor and the declaration it refers to. The index holds this file too, so
 * a declaration's own name is found there as well: by identity, not by text, because a name
 * declared twice must point at its own declaration.
 */
function targetAt(
  doc: ApiDocument,
  offset: number,
): { readonly ref: ApiRef; readonly found: Declared<ProjectDecls[ProjectKind]> } | undefined {
  const ref = apiRefs(doc.source.file, doc.index).find((r) => touches(r.name.span, offset));
  if (ref === undefined) return undefined;
  const found = ref.declaration
    ? doc.index.named(ref.kind, ref.name.text).find((d) => d.decl.name === ref.name)
    : doc.index.lookup(ref.kind, ref.name.text);
  return found === undefined ? undefined : { ref, found };
}

/** Where a declaration comes from, as a reader names it. */
function originOf(source: ApiSource): string {
  return source.origin === 'app' ? `${source.id}.fudapi` : `${source.origin.package} · ${source.id}.fudapi`;
}

export function apiHover(doc: ApiDocument, offset: number, host: ApiHost): Hover | undefined {
  const target = targetAt(doc, offset);
  if (target === undefined) return undefined;
  const { decl, source } = target.found;
  const text = source === doc.source ? doc.text : (host.read(source.path) ?? '');
  const signature = text.slice(decl.span.start, decl.span.end);
  const parts = [`\`\`\`fudapi\n${signature}\n\`\`\``];
  if (decl.doc !== undefined) parts.push(decl.doc);
  parts.push(`\`${originOf(source)}\``);
  return {
    contents: { kind: 'markdown', value: parts.join('\n\n') },
    range: rangeOf(doc.path, doc.text, target.ref.name.span),
  };
}

export function apiDefinition(doc: ApiDocument, offset: number, host: ApiHost): LocationLink[] | undefined {
  const target = targetAt(doc, offset);
  if (target === undefined) return undefined;
  const { decl, source } = target.found;
  const text = source === doc.source ? doc.text : (host.read(source.path) ?? '');
  const range = rangeOf(source.path, text, decl.name.span);
  return [
    {
      targetUri: pathToUri(source.path).toString(),
      targetRange: rangeOf(source.path, text, decl.span),
      targetSelectionRange: range,
      originSelectionRange: rangeOf(doc.path, doc.text, target.ref.name.span),
    },
  ];
}
