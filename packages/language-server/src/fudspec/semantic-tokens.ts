/**
 * Semantic tokens of a `.fudspec` (SDD-52 §4.3): what the grammar cannot know because it needs
 * the term modules. A term that resolves is a `function` — a framework one also
 * `defaultLibrary` — and one that does not is a `function` marked `deprecated`, which the
 * editor strikes through next to its error. A component tag in an `element` argument — the bare
 * one, or a step of a reference (`fud-list>role:button`) — is a component tag.
 *
 * The lines of the validator (`props`, `data`, `answers`, `services`, `path`, `url` in `given`,
 * and `as` anywhere) are not terms: the grammar paints them, and there is no module to resolve.
 *
 * Standard types and modifiers only, plus the `fudComponentTag` the `.fud` already paints: the
 * legend is one for the whole server.
 */

import type { Span } from '@fudic/diagnostics';
import { AS_LINE, fixtureLineOf, normalizeTerm, type Arg } from '@fudic/spec';
import { termLines, type SpecDocument } from './document.js';
import type { SpecHost } from './host.js';

export interface SpecToken {
  readonly span: Span;
  readonly type: 'function' | 'fudComponentTag';
  readonly modifiers: readonly ('deprecated' | 'defaultLibrary')[];
}

/** The spans of the component tags an `element` argument names. */
function tagSpans(arg: Arg): readonly Span[] {
  if (arg.kind === 'bare') return [arg.span];
  if (arg.kind === 'string') return [];
  return arg.steps.flatMap((step) => (step.kind === 'tag' ? [step.tag.span] : []));
}

export function specSemanticTokens(spec: SpecDocument, host: SpecHost): readonly SpecToken[] {
  const terms = host.terms(spec.path);
  const tokens: SpecToken[] = [];
  for (const { block, term } of termLines(spec.file)) {
    if (term.name.text === AS_LINE || fixtureLineOf(term.name.text, block, terms) !== undefined) continue;
    const module = terms.resolve(block, normalizeTerm(term.name.text));
    if (module === undefined) {
      tokens.push({ span: term.name.span, type: 'function', modifiers: ['deprecated'] });
      continue;
    }
    tokens.push({ span: term.name.span, type: 'function', modifiers: module.layer === 'framework' ? ['defaultLibrary'] : [] });
    term.args.forEach((arg, i) => {
      if (module.params[i]?.type !== 'element') return;
      for (const span of tagSpans(arg)) tokens.push({ span, type: 'fudComponentTag', modifiers: [] });
    });
  }
  return tokens;
}
