/**
 * Semantic tokens of a `.fudspec` (SDD-52 §4.3): what the grammar cannot know because it needs
 * the term modules. A term that resolves is a `function` — a framework one also
 * `defaultLibrary` — and one that does not is a `function` marked `deprecated`, which the
 * editor strikes through next to its error. A bare argument of an `element` parameter is a
 * component tag.
 *
 * Standard types and modifiers only, plus the `fudComponentTag` the `.fud` already paints: the
 * legend is one for the whole server.
 */

import type { Span } from '@fudic/diagnostics';
import { normalizeTerm } from '@fudic/spec';
import { termLines, type SpecDocument } from './document.js';
import type { SpecHost } from './host.js';

export interface SpecToken {
  readonly span: Span;
  readonly type: 'function' | 'fudComponentTag';
  readonly modifiers: readonly ('deprecated' | 'defaultLibrary')[];
}

export function specSemanticTokens(spec: SpecDocument, host: SpecHost): readonly SpecToken[] {
  const terms = host.terms(spec.path);
  const tokens: SpecToken[] = [];
  for (const { block, term } of termLines(spec.file)) {
    // `props` is not a term: the grammar paints it, and there is no module to resolve.
    if (term.name.text === 'props') continue;
    const module = terms.resolve(block, normalizeTerm(term.name.text));
    if (module === undefined) {
      tokens.push({ span: term.name.span, type: 'function', modifiers: ['deprecated'] });
      continue;
    }
    tokens.push({ span: term.name.span, type: 'function', modifiers: module.layer === 'framework' ? ['defaultLibrary'] : [] });
    term.args.forEach((arg, i) => {
      if (arg.kind === 'bare' && module.params[i]?.type === 'element') {
        tokens.push({ span: arg.span, type: 'fudComponentTag', modifiers: [] });
      }
    });
  }
  return tokens;
}
