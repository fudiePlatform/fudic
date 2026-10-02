import { describe, expect, it } from 'vitest';
import { parseSpec } from '../src/index.js';
import { slice } from './helpers.js';

const HEAD = 'component fud-x\n';

describe('comments (criterion 3)', () => {
  it('keeps a comment after a slug out of the slug', () => {
    const source = `${HEAD}criterion a   # nota\n  then\n    t`;
    const { value, diagnostics } = parseSpec(source);
    expect(diagnostics).toEqual([]);
    expect(value.criteria[0]?.slug?.text).toBe('a');
    expect(value.comments.map((c) => slice(source, c))).toEqual(['# nota']);
  });

  it('reads `#fff` opening a token as a comment', () => {
    const source = `${HEAD}criterion a\n  then\n    min-height x #fff`;
    const { value } = parseSpec(source);
    const line = value.criteria[0]!.blocks[0]!.terms[0]!;
    expect(line.args.map((a) => a.kind === 'bare' && a.text)).toEqual(['x']);
    expect(slice(source, line.span)).toBe('min-height x');
    expect(value.comments.map((c) => slice(source, c))).toEqual(['#fff']);
  });

  it('reads `a#b` inside a token as an argument', () => {
    const source = `${HEAD}criterion a\n  then\n    min-height x a#b`;
    const { value } = parseSpec(source);
    const line = value.criteria[0]!.blocks[0]!.terms[0]!;
    expect(line.args.map((a) => a.kind === 'bare' && a.text)).toEqual(['x', 'a#b']);
    expect(value.comments).toEqual([]);
  });

  it('reads a `#` inside quotes as a character', () => {
    const source = `${HEAD}criterion a\n  then\n    t "a # b" # real`;
    const { value } = parseSpec(source);
    expect(value.criteria[0]!.blocks[0]!.terms[0]!.args[0]).toMatchObject({ kind: 'string', text: 'a # b' });
    expect(value.comments.map((c) => slice(source, c))).toEqual(['# real']);
  });

  it('keeps a whole-line comment at any indentation without a diagnostic', () => {
    const source = `${HEAD}# top\n   # odd\n\t# tabbed\ncriterion a\n  then\n    t`;
    const { value, diagnostics } = parseSpec(source);
    expect(diagnostics).toEqual([]);
    expect(value.comments.map((c) => slice(source, c))).toEqual(['# top', '# odd', '# tabbed']);
  });
});
