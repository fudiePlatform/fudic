/**
 * SDD-67 §4.5 and criterion 19 — the rules under an argument of a function, in the editor:
 * completion offers the six of `@fudic/forms` and none of the project's; hover, definition and
 * the semantic tokens treat a rule under an argument as one under a field.
 *
 * The project here publishes `@fudic/forms` as the package does — its six rules, read from the
 * package itself — and declares a rule of its own, which must never be offered.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { MarkupContent } from 'vscode-languageserver-protocol';
import { URI } from 'vscode-uri';
import { apiCompletions } from '../../src/fudapi/completion.js';
import { apiDefinition, apiHover } from '../../src/fudapi/navigation.js';
import { apiSemanticTokens } from '../../src/fudapi/semantic-tokens.js';
import { FILES, FORMS, SRC, apiDocument, cursor, world } from './_api.js';

const SIX = ['required', 'min', 'max', 'min-length', 'max-length', 'pattern'];

const FORMS_RULES = readFileSync(new URL('../../../forms/fudapi/rules.fudapi', import.meta.url), 'utf8');

const PROJECT: Readonly<Record<string, string | undefined>> = {
  ...FILES,
  [`${FORMS}/rules.fudapi`]: FORMS_RULES,
  [`${SRC}/rules/taken.fudapi`]: 'rule email-taken\n  on field str\n  runs server\n  fails taken\n',
};

function at(marked: string) {
  const { text, offset } = cursor(marked);
  const { host } = world({ files: PROJECT });
  return { doc: apiDocument(host, text), offset, host, text };
}

const labels = (marked: string): readonly string[] | undefined => {
  const { doc, offset } = at(marked);
  return apiCompletions(doc, offset)?.items.map((i) => i.label);
};

const hoverText = (marked: string): string | undefined => {
  const { doc, offset, host } = at(marked);
  return (apiHover(doc, offset, host)?.contents as MarkupContent | undefined)?.value;
};

describe('criterion 19: completion under an argument', () => {
  it('the six rules and none of the project, under a body argument', () => {
    expect(labels('put save\n  name  str\n    |')).toEqual(SIX);
  });

  it('the same under an argument of the route and of query', () => {
    expect(labels('put save /:id\n  id  uuid\n    |')).toEqual(SIX);
    expect(labels('get search\n  query q  str\n    |')).toEqual(SIX);
  });

  it('the six whatever the type: the validator says what applies, not the completion', () => {
    expect(labels('put save\n  age  u8\n    |')).toEqual(SIX);
  });

  it('under a field, the project rule is still offered: only an argument leaves it out', () => {
    expect(labels('form f\n  a  str\n    |')).toContain('email-taken');
  });

  it('a rule under an argument takes its arguments as under a field: a pattern of the project', () => {
    expect(labels('put save\n  name  str\n    pattern |')).toEqual(['email']);
  });

  it('the placeholders of its text are its parameters', () => {
    expect(labels('put save\n  name  str\n    max-length 80  "At most {|')).toEqual(['n']);
  });

  it('nothing deeper than the rules of an argument', () => {
    expect(labels('put save\n  name  str\n    required\n      |') ?? []).toEqual([]);
  });
});

describe('criterion 19: hover, definition and tokens under an argument', () => {
  it('the hover of max-length under an argument shows its doc, as under a field', () => {
    const arg = hoverText('put save\n  name  str\n    max-len|gth 80')!;
    expect(arg).toContain('rule max-length');
    expect(arg).toContain('A text or a list with n characters or items at most.');
    expect(arg).toBe(hoverText('form f\n  name  str\n    max-len|gth 80'));
  });

  it('the definition of a rule under an argument opens the rules of @fudic/forms', () => {
    const { doc, offset, host } = at('put save\n  q  str\n    requir|ed');
    const [link] = apiDefinition(doc, offset, host)!;
    expect(link!.targetUri).toBe(URI.file(`${FORMS}/rules.fudapi`).toString());
  });

  it('the hover of a pattern word under an argument is the pattern', () => {
    expect(hoverText('put save\n  name  str\n    pattern em|ail')).toContain('pattern email');
  });

  it('a rule and a pattern under an argument get the tokens they get under a field', () => {
    const tokensOf = (text: string) => {
      const { host } = world({ files: PROJECT });
      return apiSemanticTokens(apiDocument(host, text)).map((t) => [text.slice(t.span.start, t.span.end), t.type, t.modifiers.join(',')]);
    };
    const under = (head: string): string => `${head}\n  name  str\n    max-length 80\n    pattern email\n    requird`;
    const arg = tokensOf(under('put save')).filter(([word]) => word !== 'put');
    const field = tokensOf(under('form f')).filter(([word]) => word !== 'form' && word !== 'f');
    expect(arg).toEqual(field);
    expect(arg).toEqual([
      ['max-length', 'function', 'defaultLibrary'],
      ['pattern', 'function', 'defaultLibrary'],
      ['email', 'regexp', 'defaultLibrary'],
      ['requird', 'function', 'deprecated'],
    ]);
  });
});
