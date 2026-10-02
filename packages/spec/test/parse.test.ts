import { describe, expect, it } from 'vitest';
import { parseSpec, type Criterion, type TermLine } from '../src/index.js';
import { CANONICAL, shape, slice } from './helpers.js';

const term = (c: Criterion | undefined, block: number, line: number): TermLine =>
  c?.blocks[block]?.terms[line] as TermLine;

describe('parseSpec — the canonical file (criterion 1)', () => {
  const { value, diagnostics } = parseSpec(CANONICAL);
  const [first, second] = value.criteria;

  it('has no diagnostics', () => {
    expect(diagnostics).toEqual([]);
  });

  it('reads the component', () => {
    expect(value.component?.tag?.text).toBe('fud-button');
  });

  it('reads two criteria with their blocks in order', () => {
    expect(value.criteria.map((c) => c.slug?.text)).toEqual(['tamano-tactil-minimo', 'icono-cambia']);
    expect(first?.blocks.map((b) => b.block)).toEqual(['given', 'then']);
    expect(second?.blocks.map((b) => b.block)).toEqual(['when', 'then']);
  });

  it('reads every term with its arguments', () => {
    expect(term(first, 0, 0).name.text).toBe('route');
    expect(term(first, 0, 0).args.map((a) => [a.kind, a.kind === 'role' ? a.role.text : a.text])).toEqual([
      ['bare', '/playground/button'],
    ]);
    expect(term(first, 1, 0).name.text).toBe('min-height');
    expect(term(first, 1, 0).args.map((a) => a.kind === 'bare' && a.text)).toEqual(['fud-button', '44']);
    expect(term(second, 0, 0).args.map((a) => a.kind)).toEqual(['bare', 'bare', 'string']);
    const role = term(second, 1, 0).args[0];
    expect(role?.kind === 'role' && [role.role.text, role.name?.text]).toEqual(['button', 'Buscar']);
  });

  it('keeps the comment', () => {
    expect(value.comments.map((c) => slice(CANONICAL, c))).toEqual(['# the icon follows the attribute']);
  });
});

describe('parseSpec — spans (criterion 4)', () => {
  const { value } = parseSpec(CANONICAL);
  const [first, second] = value.criteria as [Criterion, Criterion];
  const at = (s: { start: number; end: number }): string => slice(CANONICAL, s);

  it('covers the whole text', () => {
    expect(value.span).toEqual({ start: 0, end: CANONICAL.length });
  });

  it('gives the component its keyword, tag and line', () => {
    const c = value.component;
    expect(c && [at(c.keyword), at(c.tag!.span), at(c.span)]).toEqual(['component', 'fud-button', 'component fud-button']);
  });

  it('ends a criterion and a block at their last term, not at a blank line', () => {
    expect(at(first.keyword)).toBe('criterion');
    expect(at(first.slug!.span)).toBe('tamano-tactil-minimo');
    expect(at(first.span)).toBe(
      'criterion tamano-tactil-minimo\n  given\n    route /playground/button\n  then\n    min-height fud-button 44',
    );
    expect(at(first.blocks[0]!.span)).toBe('given\n    route /playground/button');
    expect(at(first.blocks[0]!.keyword)).toBe('given');
    expect(at(first.blocks[1]!.span)).toBe('then\n    min-height fud-button 44');
  });

  it('keeps the comment out of the criterion and its slug', () => {
    expect(at(second.slug!.span)).toBe('icono-cambia');
    expect(at(second.span).startsWith('criterion icono-cambia   # the icon follows the attribute\n  when')).toBe(true);
    expect(at(second.span).endsWith('visible role:button/"Buscar"')).toBe(true);
  });

  it('gives each term its line, name and arguments', () => {
    const set = term(second, 0, 0);
    expect(at(set.span)).toBe('set-attribute fud-button icon "search"');
    expect(at(set.name.span)).toBe('set-attribute');
    expect(set.args.map((a) => at(a.span))).toEqual(['fud-button', 'icon', '"search"']);
    const str = set.args[2];
    expect(str?.kind === 'string' && at(str.contentSpan)).toBe('search');
    const role = term(second, 1, 0).args[0];
    expect(role?.kind === 'role' && [at(role.span), at(role.role.span), at(role.name!.span)]).toEqual([
      'role:button/"Buscar"',
      'button',
      '"Buscar"',
    ]);
  });
});

describe('parseSpec — line breaks (criterion 5)', () => {
  const lf = parseSpec(CANONICAL);

  it.each([
    ['\\r\\n', '\r\n'],
    ['\\r', '\r'],
  ])('reads %s like \\n', (_, eol) => {
    const source = CANONICAL.replaceAll('\n', eol);
    const { value, diagnostics } = parseSpec(source);
    expect(diagnostics).toEqual([]);
    expect(shape(value)).toEqual(shape(lf.value));
    expect(value.comments.map((c) => slice(source, c))).toEqual(['# the icon follows the attribute']);
    expect(slice(source, value.criteria[0]!.blocks[1]!.span)).toBe(`then${eol}    min-height fud-button 44`);
  });
});

describe('parseSpec — the empty file (criterion 6)', () => {
  it('is a file without criteria and one FUD0922 at [0, 0)', () => {
    const { value, diagnostics } = parseSpec('');
    expect(value).toEqual({ kind: 'spec', criteria: [], comments: [], span: { start: 0, end: 0 } });
    expect(diagnostics.map((d) => [d.code, d.span])).toEqual([['FUD0922', { start: 0, end: 0 }]]);
  });

  it('is the same with only blank and comment lines', () => {
    const { value, diagnostics } = parseSpec('\n   \n\t\n  # only a note\n');
    expect(value.criteria).toEqual([]);
    expect(value.comments).toHaveLength(1);
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0922']);
  });
});
