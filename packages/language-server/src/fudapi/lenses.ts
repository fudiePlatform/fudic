/**
 * The CodeLens of a `.fudapi` (SDD-75 §3.2): over each declaration a handler implements, who does
 * it — a lens per file, `not implemented` when none, and one per half of a middleware.
 */

import { exportedName, type Decl } from '@fudic/api';
import type { CodeLens } from 'vscode-languageserver-protocol';
import { rangeOf, type ApiDocument } from './document.js';
import type { Implementation, ImplementationMethod } from './implementations.js';

/** The client command a lens over a declaration runs: `(file, range)`. */
export const GO_TO_IMPLEMENTATION = 'fudic.api.goToImplementation';

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
            command: GO_TO_IMPLEMENTATION,
            arguments: [f.file, f.range],
          },
        });
      }
    }
  }
  return lenses;
}
