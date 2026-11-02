/**
 * The CodeLens of a `.fudapi` (SDD-75 §3.2): on line 1, what it generates; over each declaration a
 * handler implements, who does it — a lens per file, `not implemented` when none, and one per half
 * of a middleware.
 */

import { exportedName, type Decl, type EnumDecl, type FormDecl, type PatternDecl, type TypeDecl } from '@fudic/api';
import type { CodeLens, Range } from 'vscode-languageserver-protocol';
import { rangeOf, type ApiDocument } from './document.js';
import type { Implementation, ImplementationMethod } from './implementations.js';

/** The client commands of the lenses (SDD-75 §3.3): the first four take the `.fudapi`'s URI; the last `(file, range)`. */
export const API_COMMANDS = {
  showTypes: 'fudic.api.showTypes',
  showServer: 'fudic.api.showServer',
  showBrowser: 'fudic.api.showBrowser',
  regenerate: 'fudic.api.regenerate',
  goToImplementation: 'fudic.api.goToImplementation',
} as const;

/** On line 1, what the file generates and the way to write it again; there with errors too. */
export function generatedLenses(doc: ApiDocument): CodeLens[] {
  const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
  const lens = (title: string, command: string): CodeLens => ({ range, command: { title, command, arguments: [doc.uri.toString()] } });
  return [
    lens('Types', API_COMMANDS.showTypes),
    lens('Server', API_COMMANDS.showServer),
    lens('Browser', API_COMMANDS.showBrowser),
    lens('Regenerate', API_COMMANDS.regenerate),
  ];
}

/** The declarations nobody implements: what they are is what they generate. */
const generates = (decl: Decl): decl is TypeDecl | EnumDecl | FormDecl | PatternDecl =>
  decl.kind === 'type' || decl.kind === 'enum' || decl.kind === 'form' || decl.kind === 'pattern';

/**
 * Over each type, enum, form and pattern, what it generates in the types of the file —
 * `interface Person`, `type Role`, `const personForm` — and a click to it there (Pedro,
 * 2026-11-02). Nothing over one the types do not have.
 */
export function typeLenses(doc: ApiDocument, types: GeneratedTypes): CodeLens[] {
  const lenses: CodeLens[] = [];
  for (const decl of doc.source.file.declarations) {
    if (!generates(decl)) continue;
    const found = generatedIn(types, decl.name.text);
    if (found === undefined) continue;
    lenses.push({
      range: rangeOf(doc.path, doc.text, { start: decl.span.start, end: decl.span.start }),
      command: { title: found.title, command: API_COMMANDS.goToImplementation, arguments: [types.path, found.range] },
    });
  }
  return lenses;
}

/** The types of a `.fudapi` on disk: where, and what they say. */
export interface GeneratedTypes {
  readonly path: string;
  readonly text: string;
}

/**
 * Where the types export what a declaration named `name` generates — `interface Person`,
 * `const save` — and that text; `undefined` when they do not.
 */
export function generatedIn(types: GeneratedTypes, name: string): { readonly title: string; readonly range: Range } | undefined {
  const exported = exportedName(name);
  const found = new RegExp(`export ((?:interface|type|const) ${exported})\\b`, 'u').exec(types.text);
  if (found === null) return undefined;
  const start = found.index + 'export '.length;
  return { title: found[1]!, range: rangeOf(types.path, types.text, { start, end: start + found[1]!.length }) };
}

/** What a declaration is implemented by: the name its module exports and the methods called on it. */
function implemented(decl: Decl): { readonly name: string; readonly methods: readonly ImplementationMethod[] } | undefined {
  switch (decl.kind) {
    case 'fn':
      return { name: exportedName(decl.name.text), methods: ['handle'] };
    case 'load':
    case 'paths':
    case 'layout':
      return { name: decl.kind, methods: ['handle'] };
    case 'rule':
      return { name: exportedName(decl.name.text), methods: ['check'] };
    case 'pipe':
      return { name: exportedName(decl.name.text), methods: ['implement'] };
    case 'middleware':
      return {
        name: exportedName(decl.name.text),
        methods: [...(decl.client !== undefined ? ['client' as const] : []), ...(decl.server !== undefined ? ['server' as const] : [])],
      };
    default:
      return undefined;
  }
}

/** The lenses over the declarations of `doc`, from what implements its module in `project`. */
export function implementationLenses(doc: ApiDocument, project: string, found: readonly Implementation[]): CodeLens[] {
  const lenses: CodeLens[] = [];
  for (const decl of doc.source.file.declarations) {
    const piece = implemented(decl);
    if (piece === undefined) continue;
    const range = rangeOf(doc.path, doc.text, { start: decl.span.start, end: decl.span.start });
    for (const method of piece.methods) {
      // A middleware says which half; anything else has one.
      const half = decl.kind === 'middleware' ? `${method}: ` : '';
      const files = new Map<string, Implementation>();
      for (const f of found) if (f.name === piece.name && f.method === method && !files.has(f.file)) files.set(f.file, f);
      if (files.size === 0) lenses.push({ range, command: { title: `${half}not implemented`, command: '' } });
      for (const f of files.values()) {
        const where = f.file.slice(project.length + 1);
        lenses.push({
          range,
          command: {
            title: half === '' ? `implemented in ${where}` : `${half}${where}`,
            command: API_COMMANDS.goToImplementation,
            arguments: [f.file, f.range],
          },
        });
      }
    }
  }
  return lenses;
}
