/**
 * SDD-82 §3.1 and §3.3: the three headers, and references made of steps — criteria 1 and 3.
 */

import { describe, expect, it } from 'vitest';
import { argText, componentTag, parseSpec, type Arg } from '../src/index.js';
import { only, slice } from './helpers.js';

const OK = 'criterion a\n  then\n    t\n';

/** The first argument of a `then` line under a component spec, with the source and its codes. */
function refOf(token: string): { source: string; arg: Arg; codes: readonly string[] } {
  const source = `component fud-x\ncriterion a\n  then\n    t ${token}\n`;
  const { value, diagnostics } = parseSpec(source);
  return { source, arg: value.criteria[0]!.blocks[0]!.terms[0]!.args[0]!, codes: diagnostics.map((d) => d.code) };
}

describe('the three headers (criterion 1)', () => {
  it.each([
    ['page', '/usuarios'],
    ['page', '/blog/[slug]'],
    ['page', '/'],
    ['flow', 'alta'],
    ['component', 'fud-x'],
  ] as const)('reads `%s %s`', (header, name) => {
    const source = `${header} ${name}\n\n${OK}`;
    const { value, diagnostics } = parseSpec(source);
    expect(diagnostics).toEqual([]);
    expect(value.header).toMatchObject({ kind: 'header', header, name: { text: name } });
    expect(slice(source, value.header!.span)).toBe(`${header} ${name}`);
  });

  it('FUD0922 without a header, with the text that names the three', () => {
    const d = only(OK);
    expect(d.code).toBe('FUD0922');
    expect(d.message).toContain('`component <tag>`, `page <route>` or `flow <name>`');
  });

  it('FUD0923 for a second header of another kind', () => {
    const source = `page /x\nflow y\n${OK}`;
    const d = only(source);
    expect([d.code, slice(source, d.span)]).toEqual(['FUD0923', 'flow']);
    expect(parseSpec(source).value.header?.header).toBe('page');
  });

  it('FUD0924 names the header that comes after a criterion', () => {
    const d = only(`${OK}flow y\n`);
    expect(d.code).toBe('FUD0924');
    expect(d.message).toBe('`flow` goes before the first `criterion`');
  });

  it.each(['page', 'flow'])('FUD0925 for a bare `%s`', (keyword) => {
    const d = only(`${keyword}\n${OK}`);
    expect([d.code, d.message]).toEqual(['FUD0925', `\`${keyword}\` needs a name`]);
  });

  it('FUD0926 after a page route', () => {
    const source = `page /x y\n${OK}`;
    const d = only(source);
    expect([d.code, slice(source, d.span)]).toEqual(['FUD0926', 'y']);
  });

  it('reads `page` and `flow` at column 0 from a wrong indentation', () => {
    for (const header of ['page /x', 'flow x']) {
      const { value, diagnostics } = parseSpec(` ${header}\n${OK}`);
      expect(diagnostics.map((d) => d.code)).toEqual(['FUD0921']);
      expect(value.header?.name?.text).toBe(header.split(' ')[1]);
    }
  });

  it('componentTag gives the tag of a component spec, and nothing for a page or a flow', () => {
    expect(componentTag(parseSpec(`component fud-x\n${OK}`).value)?.text).toBe('fud-x');
    expect(componentTag(parseSpec(`page /x\n${OK}`).value)).toBeUndefined();
    expect(componentTag(parseSpec(`flow x\n${OK}`).value)).toBeUndefined();
    expect(componentTag(parseSpec(OK).value)).toBeUndefined();
  });
});

describe('references in steps (criterion 3)', () => {
  it('reads `role:row/~"Luis">role:button/"Borrar"` as two steps, the first contained', () => {
    const { source, arg, codes } = refOf('role:row/~"Luis">role:button/"Borrar"');
    expect(codes).toEqual([]);
    if (arg.kind !== 'role') throw new Error('not a reference');
    expect(arg.steps).toMatchObject([
      { kind: 'role', role: { text: 'row' }, name: { text: 'Luis', match: 'contains' } },
      { kind: 'role', role: { text: 'button' }, name: { text: 'Borrar', match: 'exact' } },
    ]);
    expect(arg.steps.map((s) => slice(source, s.span))).toEqual(['role:row/~"Luis"', 'role:button/"Borrar"']);
    const [row] = arg.steps;
    expect(row?.kind === 'role' && slice(source, row.name!.span)).toBe('~"Luis"');
  });

  it('reads tag steps, and a tag before a role', () => {
    const { arg, codes } = refOf('fud-list>li');
    expect(codes).toEqual([]);
    expect(arg).toMatchObject({ kind: 'role', steps: [{ kind: 'tag', tag: { text: 'fud-list' } }, { kind: 'tag', tag: { text: 'li' } }] });
    expect(refOf('fud-list>role:button').arg).toMatchObject({ steps: [{ kind: 'tag' }, { kind: 'role', role: { text: 'button' } }] });
  });

  it('keeps a `>` inside quotes in the name', () => {
    const { arg, codes } = refOf('role:button/"a>b"');
    expect(codes).toEqual([]);
    expect(arg).toMatchObject({ steps: [{ name: { text: 'a>b' } }] });
  });

  it('leaves a lone tag bare', () => {
    expect(refOf('fud-x').arg.kind).toBe('bare');
  });

  it.each([
    ['role:row/~>role:button', 'role:row/~', 'the text after `~`'],
    ['role:row/~""', 'role:row/~""', 'the text after `~`'],
    ['a>', '>', 'a step beside `>`'],
    ['>a', '>', 'a step beside `>`'],
    ['a>>b', '>', 'a step beside `>`'],
  ])('FUD1509 for `%s`, and the token stays bare', (token, at, missing) => {
    const { source, arg, codes } = refOf(token);
    expect(codes).toEqual(['FUD1509']);
    expect(arg.kind).toBe('bare');
    const d = parseSpec(source).diagnostics[0]!;
    expect(slice(source, d.span)).toBe(at === '>' ? '>' : at.slice(at.indexOf('/') + 1));
    expect(d.message).toContain(missing);
  });

  it.each(['role:row/x', 'role:row/', 'role:row/"a""b"', 'a"b">c', 'role:"x"', 'role:/"x"', 'role:a/b/"x"', 'role:x/~y'])(
    'FUD0935 for the malformed step in `%s`',
    (token) => {
      const { arg, codes } = refOf(token);
      expect(codes).toEqual(['FUD0935']);
      expect(arg.kind).toBe('bare');
    },
  );

  it('an unclosed quote is only FUD0920, and the token stays bare', () => {
    const { arg, codes } = refOf('role:row/~"Luis');
    expect(codes).toEqual(['FUD0920']);
    expect(arg.kind).toBe('bare');
  });
});

describe('argText: what the term receives', () => {
  it.each([
    ['fud-x', 'fud-x'],
    ['"a b"', 'a b'],
    ['role:button', 'role:button'],
    ['role:row/~"Luis">role:button/"Borrar"', 'role:row/~"Luis">role:button/"Borrar"'],
    ['fud-list>li', 'fud-list>li'],
    ['role:button/"say \\"hi\\" \\\\ bye"', 'role:button/"say \\"hi\\" \\\\ bye"'],
  ])('%s → %s', (token, text) => {
    expect(argText(refOf(token).arg)).toBe(text);
  });
});
