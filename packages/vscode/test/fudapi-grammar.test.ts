/**
 * The `.fudapi` TextMate grammar (SDD-60 §4.10): a snapshot of the tokens of a contract file and
 * of an extensions file, plus a named assertion per scope so that a snapshot update cannot
 * quietly accept a regression.
 */

import { describe, expect, it } from 'vitest';
import { findExact, tokenize, type Token } from './_tokenize.js';

const BASE = 'source.fudapi';

const api = (source: string): Promise<Token[]> => tokenize(source, BASE);

/** One line per token: its text and its scopes below the base one. */
const render = (tokens: readonly Token[]): string =>
  tokens
    .map((t) => `${t.line}  ${JSON.stringify(t.text)}  ${t.scopes.filter((s) => s !== BASE).join(' ') || '-'}`)
    .join('\n');

/** The innermost scope of the token exactly `text` on `line`. */
const scopeAt = (tokens: readonly Token[], line: number, text: string): string | undefined =>
  findExact(
    tokens.filter((t) => t.line === line),
    text,
  ).scopes.at(-1);

/** The contract of a route: SDD §1, with a route, a query argument and a form (§3.3, §3.6). */
const CONTRACT = [
  '# Per request: the list changes with every new person.',
  'load ssr ttl 5m cache-first page persist 1h',
  '  users  Person[]',
  '',
  'put save /:id/lines/:line',
  '  use auth',
  '  skip csrf',
  '  query notify  bool?',
  '  id      uuid',
  '  fails taken 409 "Ya existe: {detail}"',
  '  -> map str Person',
  '',
  'paths',
  'chain',
  '  compress gzip 200',
  '',
  'enum Variant          # a union of literals',
  '  default',
  '',
  'form userForm',
  '  name  str = ""',
  '    min-length 3  "Al menos {n} \\"letras\\"."',
  '  acceso  group',
  '    clave  str',
  '    summary',
  '      require mismatch  clave == repetir and not empty clave',
  '                        "Las contraseñas no coinciden."',
  '',
  'messages',
  '  required  "Obligatorio.',
].join('\n');

/** An extensions file: rules, middlewares and patterns (§3.7–§3.9). */
const EXTENSIONS = [
  'rule nif-unique',
  '  on field str',
  '  runs server',
  '  async',
  '  fails nif-taken',
  '',
  'middleware auth',
  '  client',
  '  server',
  '  adds',
  '    user  User',
  '',
  'pattern email-loose  [^@\\s]+@[^@\\s]+\\.[^@\\s]+   ',
  'pattern hex  #[0-9a-f]{6} # not a comment',
].join('\n');

describe('the .fudapi grammar — snapshots', () => {
  it('tokenises a contract file', async () => {
    expect(render(await api(CONTRACT))).toMatchSnapshot();
  });

  it('tokenises an extensions file', async () => {
    expect(render(await api(EXTENSIONS))).toMatchSnapshot();
  });
});

describe('the .fudapi grammar — scopes', () => {
  it('paints the keyword and the name of each declaration', async () => {
    const t = await api(CONTRACT);
    expect(scopeAt(t, 1, 'load')).toBe('keyword.control.declaration.fudapi');
    expect(scopeAt(t, 4, 'put')).toBe('keyword.control.verb.fudapi');
    expect(scopeAt(t, 4, 'save')).toBe('entity.name.function.fudapi');
    expect(scopeAt(t, 4, '/:id/lines/:line')).toBe('string.unquoted.route.fudapi');
    expect(scopeAt(t, 12, 'paths')).toBe('keyword.control.declaration.fudapi');
    expect(scopeAt(t, 16, 'enum')).toBe('keyword.control.declaration.fudapi');
    expect(scopeAt(t, 16, 'Variant')).toBe('entity.name.type.fudapi');
    expect(scopeAt(t, 19, 'userForm')).toBe('entity.name.type.fudapi');
  });

  it('paints the strategy of `load`', async () => {
    const t = await api(CONTRACT);
    for (const word of ['ssr', 'ttl', 'cache-first', 'page', 'persist']) {
      expect(scopeAt(t, 1, word)).toBe('constant.language.strategy.fudapi');
    }
    expect(scopeAt(t, 1, '5m')).toBe('constant.numeric.duration.fudapi');
    expect(scopeAt(t, 1, '1h')).toBe('constant.numeric.duration.fudapi');
  });

  it('paints the clauses, the types, the arrow, the numbers and the operators', async () => {
    const t = await api(CONTRACT);
    for (const [line, word] of [[5, 'use'], [6, 'skip'], [7, 'query'], [9, 'fails'], [14, 'compress'], [24, 'summary'], [25, 'require']] as const) {
      expect(scopeAt(t, line, word)).toBe('keyword.other.clause.fudapi');
    }
    expect(scopeAt(t, 8, 'uuid')).toBe('support.type.primitive.fudapi');
    expect(scopeAt(t, 7, 'bool?')).toBe('support.type.primitive.fudapi');
    expect(scopeAt(t, 2, 'Person[]')).toBe('entity.name.type.fudapi');
    expect(scopeAt(t, 10, '->')).toBe('keyword.operator.returns.fudapi');
    expect(scopeAt(t, 10, 'map')).toBe('support.type.primitive.fudapi');
    expect(scopeAt(t, 9, '409')).toBe('constant.numeric.fudapi');
    expect(scopeAt(t, 22, 'group')).toBe('support.type.primitive.fudapi');
    expect(scopeAt(t, 25, '==')).toBe('keyword.operator.comparison.fudapi');
    for (const word of ['and', 'not', 'empty']) expect(scopeAt(t, 25, word)).toBe('keyword.operator.word.fudapi');
    expect(scopeAt(t, 20, '=')).toBe('keyword.operator.assignment.fudapi');
  });

  it('paints strings with their escapes and placeholders; an unclosed one ends with its line', async () => {
    const t = await api(CONTRACT);
    expect(scopeAt(t, 9, '{detail}')).toBe('variable.other.placeholder.fudapi');
    expect(scopeAt(t, 21, '{n}')).toBe('variable.other.placeholder.fudapi');
    expect(scopeAt(t, 21, '\\"')).toBe('constant.character.escape.fudapi');
    expect(scopeAt(t, 26, 'Las contraseñas no coinciden.')).toBe('string.quoted.double.fudapi');
    expect(scopeAt(t, 29, 'Obligatorio.')).toBe('string.quoted.double.fudapi');
    // Nothing after the unclosed string bleeds: a probe line is back at the base scope.
    const probe = await api(`${CONTRACT}\nPROBE`);
    expect(findExact(probe.filter((x) => x.line === 30), 'PROBE').scopes).toEqual([BASE]);
  });

  it('a `#` opens a comment only where it opens a token', async () => {
    const t = await api(CONTRACT);
    expect(scopeAt(t, 0, ' Per request: the list changes with every new person.')).toBe('comment.line.number-sign.fudapi');
    expect(scopeAt(t, 16, ' a union of literals')).toBe('comment.line.number-sign.fudapi');
  });

  it('a pattern takes the rest of its line as the regex, `#` included, trailing blanks left out', async () => {
    const t = await api(EXTENSIONS);
    expect(scopeAt(t, 12, 'pattern')).toBe('keyword.control.declaration.fudapi');
    expect(scopeAt(t, 12, 'email-loose')).toBe('entity.name.constant.fudapi');
    expect(scopeAt(t, 12, '[^@\\s]+@[^@\\s]+\\.[^@\\s]+')).toBe('string.regexp.fudapi');
    expect(scopeAt(t, 13, '#[0-9a-f]{6} # not a comment')).toBe('string.regexp.fudapi');
  });

  it('paints the clauses of rules and middlewares', async () => {
    const t = await api(EXTENSIONS);
    expect(scopeAt(t, 0, 'rule')).toBe('keyword.control.declaration.fudapi');
    expect(scopeAt(t, 0, 'nif-unique')).toBe('entity.name.type.fudapi');
    for (const [line, word] of [[1, 'on'], [2, 'runs'], [3, 'async'], [7, 'client'], [8, 'server'], [9, 'adds']] as const) {
      expect(scopeAt(t, line, word)).toBe('keyword.other.clause.fudapi');
    }
    expect(scopeAt(t, 10, 'User')).toBe('entity.name.type.fudapi');
  });
});
