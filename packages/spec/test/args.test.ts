import { describe, expect, it } from 'vitest';
import { parseSpec, type Arg } from '../src/index.js';
import { slice } from './helpers.js';

/** The arguments of `x` under a minimal criterion, with the source and its diagnostics. */
function argsOf(line: string): { source: string; args: readonly Arg[]; codes: readonly string[] } {
  const source = `component fud-x\ncriterion a\n  then\n    ${line}`;
  const { value, diagnostics } = parseSpec(source);
  return { source, args: value.criteria[0]!.blocks[0]!.terms[0]!.args, codes: diagnostics.map((d) => d.code) };
}

describe('arguments (criterion 2)', () => {
  it('reads bare, bare and an escaped string', () => {
    const { source, args, codes } = argsOf('set-attribute fud-button icon "search \\"x\\""');
    expect(codes).toEqual([]);
    expect(args.map((a) => a.kind)).toEqual(['bare', 'bare', 'string']);
    const str = args[2]!;
    if (str.kind !== 'string') throw new Error('not a string');
    expect(str.text).toBe('search "x"');
    expect(slice(source, str.span)).toBe('"search \\"x\\""');
    expect(slice(source, str.contentSpan)).toBe('search \\"x\\"');
  });

  it('reads a role with an accessible name with blanks', () => {
    const { source, args, codes } = argsOf('click role:button/"Detalles con espacio"');
    expect(codes).toEqual([]);
    const role = args[0]!;
    if (role.kind !== 'role') throw new Error('not a role');
    expect(role.role.text).toBe('button');
    expect(role.name?.text).toBe('Detalles con espacio');
    expect(slice(source, role.name!.span)).toBe('"Detalles con espacio"');
    expect(slice(source, role.span)).toBe('role:button/"Detalles con espacio"');
  });

  it('reads a role without a name', () => {
    const { source, args } = argsOf('click role:button');
    const role = args[0]!;
    expect(role.kind).toBe('role');
    expect(role.kind === 'role' && role.name).toBeUndefined();
    expect(role.kind === 'role' && slice(source, role.role.span)).toBe('button');
  });
});

describe('arguments — escapes', () => {
  it.each([
    ['"a\\\\b"', 'a\\b'],
    ['"a\\nb"', 'a\\nb'],
    ['""', ''],
    ['"# not a comment"', '# not a comment'],
  ])('%s is the string %j', (written, text) => {
    const { args, codes } = argsOf(`t ${written}`);
    expect(codes).toEqual([]);
    expect(args[0]).toMatchObject({ kind: 'string', text });
  });

  it('keeps a backslash at the end of an unclosed string', () => {
    const { args, codes } = argsOf('t "a\\');
    expect(codes).toEqual(['FUD0920']);
    expect(args[0]).toMatchObject({ kind: 'string', text: 'a\\' });
  });
});

describe('arguments — malformed ones degrade to bare with FUD0935', () => {
  it.each([
    'role:',
    'role:a/b',
    'role:/"x"',
    'role:a/b/"x"',
    'role:button"x"',
    'a"x"',
    '"a"b',
    '"a""b"',
    'role:x/"a""b"',
  ])('%s', (written) => {
    const { source, args, codes } = argsOf(`t ${written}`);
    expect(codes).toEqual(['FUD0935']);
    expect(args[0]?.kind).toBe('bare');
    expect(slice(source, args[0]!.span)).toBe(written);
    expect(parseSpec(source).diagnostics[0]?.span).toEqual(args[0]?.span);
  });

  it.each(['"abc', 'a"x', 'role:button/"open', '"a"b"c'])('%s with an unclosed quote is only FUD0920', (written) => {
    const { codes } = argsOf(`t ${written}`);
    expect(codes).toEqual(['FUD0920']);
  });

  it('an unclosed whole-token string is still a string to the end of the line', () => {
    const { source, args } = argsOf('t "abc def');
    const str = args[0]!;
    expect(str.kind).toBe('string');
    expect(str.kind === 'string' && [str.text, slice(source, str.contentSpan)]).toEqual(['abc def', 'abc def']);
  });
});
