/**
 * The `.fudspec` TextMate grammar (SDD-52 §4.3, criterion 20): a snapshot of the tokens of the
 * canonical file and of one with every case, plus a named assertion per scope so that a
 * snapshot update cannot quietly accept a regression.
 */

import { describe, expect, it } from 'vitest';
import { findExact, tokenize, type Token } from './_tokenize.js';

const BASE = 'source.fudspec';

const spec = (source: string): Promise<Token[]> => tokenize(source, BASE);

/** One line per token: its text and its scopes below the base one. */
const render = (tokens: readonly Token[]): string =>
  tokens
    .map((t) => `${t.line}  ${JSON.stringify(t.text)}  ${t.scopes.filter((s) => s !== BASE).join(' ') || '-'}`)
    .join('\n');

/** The innermost scope of the token that is exactly `text`. */
const scopeOf = (tokens: readonly Token[], text: string): string | undefined => findExact(tokens, text).scopes.at(-1);

/** The innermost scope of the token exactly `text` on `line`. */
const scopeAt = (tokens: readonly Token[], line: number, text: string): string | undefined =>
  findExact(
    tokens.filter((t) => t.line === line),
    text,
  ).scopes.at(-1);

const CANONICAL = [
  'component fud-button',
  '',
  'criterion tamano-tactil-minimo',
  '  given',
  '    route /playground/button',
  '  then',
  '    min-height fud-button 44',
  '',
  'criterion icono-cambia',
  '  when',
  '    set-attribute fud-button icon "search"',
  '  then',
  '    visible role:button/"Buscar"',
  '',
].join('\n');

const EVERY_CASE = [
  'component fud-card # the card',
  '# a full-line note',
  'criterion all-cases   # nota',
  '  given # setup',
  '    props titulo-largo',
  '    route /x "dice \\"hola\\" y \\\\"',
  '  when',
  '    click role:button/"Detalles con espacio"',
  '    focus role:textbox',
  '    type "x # y" #fff',
  '    set a#b 12px -1.5e3 .5 44',
  '    open "unclosed',
  '  then',
  '      # an indented note',
  '    min-height fud-card 44',
  '   off-by-one',
  '  thn',
  '\tthen',
  'component "quoted"',
  'criterion #not-a-slug',
  '',
].join('\n');

describe('the .fudspec grammar — snapshots (criterion 20)', () => {
  it('tokenises the canonical file', async () => {
    expect(render(await spec(CANONICAL))).toMatchSnapshot();
  });

  it('tokenises a file with every case', async () => {
    expect(render(await spec(EVERY_CASE))).toMatchSnapshot();
  });
});

describe('the .fudspec grammar — scopes', () => {
  it('scopes the structural keywords and their names', async () => {
    const t = await spec(CANONICAL);
    expect(scopeOf(t, 'component')).toBe('keyword.control.fudspec');
    expect(scopeOf(t, 'fud-button')).toBe('entity.name.type.fudspec');
    expect(scopeAt(t, 2, 'criterion')).toBe('keyword.control.fudspec');
    expect(scopeOf(t, 'tamano-tactil-minimo')).toBe('entity.name.section.fudspec');
    for (const block of ['given', 'when', 'then']) expect(scopeOf(t, block)).toBe('keyword.other.block.fudspec');
  });

  it('scopes the term, props, numbers and roles', async () => {
    const t = await spec(EVERY_CASE);
    expect(scopeOf(t, 'route')).toBe('entity.name.function.fudspec');
    expect(scopeOf(t, 'min-height')).toBe('entity.name.function.fudspec');
    expect(scopeOf(t, 'props')).toBe('support.function.fudspec');
    expect(scopeOf(t, '44')).toBe('constant.numeric.fudspec');
    expect(scopeOf(t, '-1.5e3')).toBe('constant.numeric.fudspec');
    expect(scopeOf(t, '.5')).toBe('constant.numeric.fudspec');
    expect(scopeAt(t, 7, 'role:')).toBe('keyword.operator.role.fudspec');
    expect(scopeOf(t, 'button')).toBe('entity.name.tag.fudspec');
    expect(scopeOf(t, 'textbox')).toBe('entity.name.tag.fudspec');
  });

  it('scopes strings, their quotes and escapes', async () => {
    const t = await spec(EVERY_CASE);
    expect(findExact(t, '"').scopes).toContain('string.quoted.double.fudspec');
    const escapes = t.filter((x) => x.line === 5 && x.scopes.includes('constant.character.escape.fudspec'));
    expect(escapes.map((x) => x.text)).toEqual(['\\"', '\\"', '\\\\']);
    const name = t.filter((x) => x.line === 7 && x.scopes.includes('string.quoted.double.fudspec'));
    expect(name.map((x) => x.text).join('')).toBe('"Detalles con espacio"');
    expect(scopeAt(t, 7, '"')).toBe('punctuation.definition.string.begin.fudspec');
  });

  it('opens a comment only where a token starts', async () => {
    const t = await spec(EVERY_CASE);
    const comments = t.filter((x) => x.scopes.includes('comment.line.number-sign.fudspec'));
    expect(comments.filter((x) => x.text !== '#').map((x) => [x.line, x.text.trim()])).toEqual([
      [0, 'the card'],
      [1, 'a full-line note'],
      [2, 'nota'],
      [3, 'setup'],
      [9, 'fff'],
      [13, 'an indented note'],
      [19, 'not-a-slug'],
    ]);
    expect(comments.filter((x) => x.text === '#').every((x) => x.scopes.includes('punctuation.definition.comment.fudspec'))).toBe(true);
    expect(t.filter((x) => x.line === 10 && x.text.includes('a#b')).every((x) => x.scopes.length === 1)).toBe(true);
    const quoted = t.filter((x) => x.line === 9 && x.text.includes('x # y'));
    expect(quoted.every((x) => x.scopes.includes('string.quoted.double.fudspec'))).toBe(true);
  });

  it('leaves `12px` as text, not a number', async () => {
    const t = await spec(EVERY_CASE);
    expect(t.filter((x) => x.line === 10 && x.text.includes('12px')).every((x) => x.scopes.length === 1)).toBe(true);
  });

  it('ends an unclosed string with its line', async () => {
    const t = await spec(EVERY_CASE);
    expect(t.filter((x) => x.line === 11).at(-1)?.scopes).toContain('string.quoted.double.fudspec');
    expect(scopeAt(t, 12, 'then')).toBe('keyword.other.block.fudspec');
  });

  it('scopes nothing at a wrong indentation or for an unknown block', async () => {
    const t = await spec(EVERY_CASE);
    for (const line of [15, 16, 17]) {
      expect(t.filter((x) => x.line === line).every((x) => x.scopes.length === 1)).toBe(true);
    }
  });

  it('does not take a quoted or commented text as a name', async () => {
    const t = await spec(EVERY_CASE);
    expect(scopeAt(t, 18, 'component')).toBe('keyword.control.fudspec');
    expect(t.filter((x) => x.line === 18).some((x) => x.scopes.includes('entity.name.type.fudspec'))).toBe(false);
    expect(t.filter((x) => x.line === 19).some((x) => x.scopes.includes('entity.name.section.fudspec'))).toBe(false);
  });

  it('reads \\r\\n like \\n', async () => {
    expect(render(await spec(CANONICAL.replaceAll('\n', '\r\n')))).toBe(render(await spec(CANONICAL)));
  });
});
