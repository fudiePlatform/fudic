/**
 * Hover and go-to-definition in a `.fudapi` (SDD-60 §4.9). Both ask what project name the
 * cursor is on and find its declaration, in this file, another of the app or a library's
 * `fudapi/`. The hover shows the declaration as it is written — its signature, with what a
 * middleware `adds` — its documentation and where it comes from; the definition opens it.
 *
 * And the way in from a `.fud` (BUG-59): a name the file takes from its `<link rel="server">`
 * opens where the contract declares it, not the generated `.d.ts` behind it.
 */

import {
  API_EXTENSION,
  type ApiIndex,
  type ApiSource,
  type Declared,
  type FormMember,
  type ProjectDecls,
  type ProjectKind,
  type TypedField,
} from '@fudic/api';
import { SRC_DIR } from '@fudic/conventions';
import type { Span } from '@fudic/diagnostics';
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

/** What a `.fud` takes from the contract it links: one of its names, or the `data` of its `load`. */
export type ServerName = { readonly name: string } | { readonly load: true };

/** A declaration found, in the source that holds it: the whole of it, and what to select. */
interface Found {
  readonly source: ApiSource;
  readonly span: Span;
  readonly name: Span;
}

/**
 * Where a name a `.fud` takes from a `<link rel="server">` is declared (SDD-60 §4.7): its
 * function, its form — in the file that declares it, which a function's `form` only names —
 * or, for `data`, the `load`. `undefined` when the contract or the name is not there.
 */
export function serverDefinition(host: ApiHost, fromFile: string, id: string, what: ServerName): LocationLink | undefined {
  return contractDefinition(host, fromFile, id, (source, index) => declarationOf(source, index, what));
}

/** `declare module "fudic:<id>"`: the contract a generated `.d.ts` was written from. */
const MODULE = /^declare module "fudic:([^"]+)"/mu;
/** What a line of a generated `.d.ts` declares: `export const save`, `export interface LoadData`. */
const OWNER = /^\s*export (const|interface) ([\w$]+)/u;
/** A member of a form's type, and the groups that open and close around it. */
const FORM_MEMBER = /([\w$]+): Form<\{|\}>|([\w$]+):/gu;

/**
 * A position of a generated `.d.ts` (`.fudic/api/<id>.d.ts`), taken back to the `.fudapi` it
 * was written from (BUG-59): a field of a form — inside its groups —, of `data`, of a project
 * type, an argument of a function, or the name itself. TypeScript lands there from
 * `personForm.name` or `data.title`; the developer wrote them in the contract. `undefined`
 * for a position the contract has no word for, which then stays where TypeScript put it.
 */
export function generatedDefinition(host: ApiHost, path: string, line: number, character: number): LocationLink | undefined {
  const text = host.read(path);
  const id = text === undefined ? undefined : MODULE.exec(text)?.[1];
  if (text === undefined || id === undefined) return undefined;

  const written = text.split('\n')[line] ?? '';
  const owner = OWNER.exec(written);
  const word = /^[\w$]+/u.exec(written.slice(character))?.[0];
  if (owner === null || word === undefined) return undefined;
  const [, kind, name = ''] = owner;

  return contractDefinition(host, path, id, (source, index): Found | undefined => {
    if (kind === 'interface') return fieldOf(name === 'LoadData' ? loadFields(source) : typeFields(index, name), word);
    if (written.indexOf(name) === character) return declarationOf(source, index, { name });
    const fn = source.file.declarations.find((d) => d.kind === 'fn' && d.name.text === name);
    if (fn?.kind === 'fn') {
      const arg = fn.args.find((a) => a.name.text === word);
      return arg === undefined ? undefined : { source, span: arg.span, name: arg.name.span };
    }
    const form = index.lookup('form', name);
    return form === undefined ? undefined : memberOf(form.decl.fields, form.source, memberPath(written, character));
  });
}

/** The contract `<id>` of the project `fromFile` is in, and what `find` finds in it, opened. */
function contractDefinition(
  host: ApiHost,
  fromFile: string,
  id: string,
  find: (source: ApiSource, index: ApiIndex) => Found | undefined,
): LocationLink | undefined {
  const path = `${host.projectOf(fromFile)}/${SRC_DIR}/${id}${API_EXTENSION}`;
  const text = host.read(path);
  if (text === undefined) return undefined;

  const { source, index } = host.load(path, text);
  const found = find(source, index);
  if (found === undefined) return undefined;

  const target = found.source === source ? text : (host.read(found.source.path) ?? '');
  return {
    targetUri: pathToUri(found.source.path).toString(),
    targetRange: rangeOf(found.source.path, target, found.span),
    targetSelectionRange: rangeOf(found.source.path, target, found.name),
  };
}

function declarationOf(source: ApiSource, index: ApiIndex, what: ServerName): Found | undefined {
  const declarations = source.file.declarations;
  if ('load' in what) {
    const load = declarations.find((d) => d.kind === 'load');
    return load === undefined ? undefined : { source, span: load.span, name: load.keyword };
  }

  const fn = declarations.find((d) => d.kind === 'fn' && d.name.text === what.name);
  if (fn?.kind === 'fn') return { source, span: fn.span, name: fn.name.span };

  // A form, wherever the project declares it: a function's `form` only names it.
  const form = index.lookup('form', what.name);
  return form === undefined ? undefined : { source: form.source, span: form.decl.span, name: form.decl.name.span };
}

/** The fields of the `load`, which `LoadData` is written from. */
function loadFields(source: ApiSource): { readonly fields: readonly TypedField[]; readonly source: ApiSource } | undefined {
  const load = source.file.declarations.find((d) => d.kind === 'load');
  return load?.kind === 'load' ? { fields: load.fields, source } : undefined;
}

/** The fields of a project type, in whichever file declares it. */
function typeFields(index: ApiIndex, name: string): { readonly fields: readonly TypedField[]; readonly source: ApiSource } | undefined {
  const type = index.lookup('type', name);
  return type?.decl.kind === 'type' ? { fields: type.decl.fields, source: type.source } : undefined;
}

function fieldOf(holder: { readonly fields: readonly TypedField[]; readonly source: ApiSource } | undefined, word: string): Found | undefined {
  const field = holder?.fields.find((f) => f.name.text === word);
  return holder === undefined || field === undefined ? undefined : { source: holder.source, span: field.span, name: field.name.span };
}

/**
 * The names from the form to the member at `character`, the form's own left out:
 * `acceso.clave` in `Form<{ name: Str; acceso: Form<{ clave: Str }> }>`.
 */
function memberPath(line: string, character: number): readonly string[] {
  const open: string[] = [];
  for (const match of line.matchAll(FORM_MEMBER)) {
    const name = match[1] ?? match[2];
    if (match.index === character && name !== undefined) return [...open.slice(1), name];
    if (match[1] !== undefined) open.push(match[1]);
    else if (name === undefined) open.pop();
  }
  return [];
}

function memberOf(members: readonly FormMember[], source: ApiSource, path: readonly string[]): Found | undefined {
  const [first, ...rest] = path;
  const member = members.find((m) => m.name.text === first);
  if (member === undefined) return undefined;
  return member.kind === 'form-group' && rest.length > 0 ? memberOf(member.fields, source, rest) : { source, span: member.span, name: member.name.span };
}
