import { describe, expect, it } from 'vitest';
import { parseSpec } from '../src/index.js';
import { codes } from './helpers.js';

const C = 'component fud-x\n';

describe('recovery (criterion 8)', () => {
  it('reads a term at 3 spaces into its block', () => {
    const { value, diagnostics } = parseSpec(`${C}criterion a\n  then\n   t x\n`);
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0921']);
    expect(value.criteria[0]?.blocks[0]?.terms.map((t) => t.name.text)).toEqual(['t']);
  });

  it('opens a block from `\\tthen`', () => {
    const { value, diagnostics } = parseSpec(`${C}criterion a\n\tthen\n    t\n`);
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0921']);
    expect(value.criteria[0]?.blocks.map((b) => [b.block, b.terms.length])).toEqual([['then', 1]]);
  });

  it.each([
    ['component', ' component fud-x\ncriterion a\n  then\n    t\n'],
    ['criterion', `${C}   criterion a\n  then\n    t\n`],
    ['a block', `${C}criterion a\n     then\n    t\n`],
  ])('reads %s at its own level from a wrong indentation', (_, source) => {
    const { value, diagnostics } = parseSpec(source);
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0921']);
    expect(value.component?.tag?.text).toBe('fud-x');
    expect(value.criteria[0]?.blocks[0]?.terms).toHaveLength(1);
  });

  it('skips the lines under an unknown block without a diagnostic each', () => {
    const { value, diagnostics } = parseSpec(`${C}criterion a\n  thn\n    t\n    u\n  then\n    v\n`);
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0929']);
    expect(value.criteria[0]?.blocks.map((b) => b.terms.map((t) => t.name.text))).toEqual([['v']]);
  });

  it('skips the lines under a block outside a criterion', () => {
    expect(codes(`${C}  then\n    t\n    u\n`)).toEqual(['FUD0931']);
  });

  it('reports a term without a block once', () => {
    expect(codes(`${C}criterion a\n    t\n    u\n  then\n    v\n`)).toEqual(['FUD0932']);
    expect(codes(`${C}    t\n    u\n`)).toEqual(['FUD0932']);
  });

  it('keeps the open block across an unknown level-0 line', () => {
    const { value, diagnostics } = parseSpec(`${C}criterion a\n  then\n    t\ncrit\n    u\n`);
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0928']);
    expect(value.criteria[0]?.blocks[0]?.terms.map((t) => t.name.text)).toEqual(['t', 'u']);
  });

  it('closes the open criterion at a component line, first or repeated', () => {
    const first = parseSpec('criterion a\n  then\n    t\ncomponent fud-x\n    u\n');
    expect(first.diagnostics.map((d) => d.code)).toEqual(['FUD0924', 'FUD0932']);
    expect(first.value.criteria[0]?.blocks[0]?.terms).toHaveLength(1);
    const repeated = parseSpec(`${C}criterion a\n  then\n    t\ncomponent fud-y\n    u\n`);
    expect(repeated.diagnostics.map((d) => d.code)).toEqual(['FUD0923', 'FUD0932']);
  });

  it('ends a criterion at its header when it has no blocks', () => {
    const source = `${C}criterion\n`;
    const { value } = parseSpec(source);
    expect(value.criteria[0]).toEqual({
      kind: 'criterion',
      keyword: { start: C.length, end: C.length + 9 },
      blocks: [],
      span: { start: C.length, end: C.length + 9 },
    });
  });

  it('ends an empty block at its keyword', () => {
    const source = `${C}criterion a\n  given\n  then\n    t\n`;
    const given = parseSpec(source).value.criteria[0]!.blocks[0]!;
    expect(given.span).toEqual(given.keyword);
  });
});

describe('a criterion without a name (criterion 9)', () => {
  it('is FUD0925 and not also FUD0933', () => {
    expect(codes(`${C}criterion\n`)).toEqual(['FUD0925']);
    expect(codes(`${C}criterion\n  given\n    t\n`)).toEqual(['FUD0925']);
  });
});
