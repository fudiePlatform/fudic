/**
 * Semantic tokens of a `.fudapi` (SDD-60 §4.9): what the grammar cannot know because it needs
 * the project. A project name is painted by its class — a type or an enum, a function for a
 * rule or a middleware, a variable for a form, a regexp for a pattern — and one that resolves
 * to nothing is marked `deprecated`, which the editor strikes through next to its error. A
 * declaration is marked `declaration`, a name from a library `defaultLibrary`. The keyword of
 * every declaration is a `keyword`.
 *
 * Standard types and modifiers only: the legend is one for the whole server.
 */

import type { Span } from '@fudic/diagnostics';
import type { ProjectKind } from '@fudic/api';
import type { ApiDocument } from './document.js';
import { apiRefs } from './refs.js';

export type ApiTokenType = 'keyword' | 'type' | 'enum' | 'function' | 'variable' | 'regexp';
export type ApiTokenModifier = 'deprecated' | 'declaration' | 'defaultLibrary';

export interface ApiToken {
  readonly span: Span;
  readonly type: ApiTokenType;
  readonly modifiers: readonly ApiTokenModifier[];
}

const TYPE_OF: Readonly<Record<Exclude<ProjectKind, 'type'>, ApiTokenType>> = {
  form: 'variable',
  rule: 'function',
  middleware: 'function',
  pattern: 'regexp',
};

export function apiSemanticTokens(doc: ApiDocument): readonly ApiToken[] {
  const tokens: ApiToken[] = doc.source.file.declarations.map((d) => ({
    span: d.kind === 'fn' ? d.verbSpan : d.keyword,
    type: 'keyword',
    modifiers: [],
  }));
  for (const ref of apiRefs(doc.source.file, doc.index)) {
    const found = doc.index.lookup(ref.kind, ref.name.text);
    const type = ref.kind === 'type' ? (found?.decl.kind === 'enum' ? 'enum' : 'type') : TYPE_OF[ref.kind];
    const modifiers: ApiTokenModifier[] = [];
    if (found === undefined) modifiers.push('deprecated');
    else if (found.source.origin !== 'app') modifiers.push('defaultLibrary');
    if (ref.declaration) modifiers.push('declaration');
    tokens.push({ span: ref.name.span, type, modifiers });
  }
  return tokens.sort((a, b) => a.span.start - b.span.start);
}
