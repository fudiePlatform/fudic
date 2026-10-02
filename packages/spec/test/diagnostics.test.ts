import { describe, expect, it } from 'vitest';
import { parseSpec } from '../src/index.js';
import { only, slice } from './helpers.js';

const C = 'component fud-x\n';
const OK = 'criterion a\n  then\n    t\n';

/** The text of the only diagnostic's span, after checking its code and that it is an error. */
function at(source: string, code: string): string {
  const d = only(source);
  expect(d.code).toBe(code);
  expect(d.severity).toBe('error');
  return slice(source, d.span);
}

describe('each parser code (criterion 7)', () => {
  it('FUD0920 — an unclosed quote, from the quote to the end of the line', () => {
    expect(at(`${C}criterion a\n  then\n    t "abc  def  \n`, 'FUD0920')).toBe('"abc  def  ');
  });

  it('FUD0921 — a wrong indentation, on the leading blanks', () => {
    expect(at(`${C}criterion a\n  then\n   t\n`, 'FUD0921')).toBe('   ');
  });

  it('FUD0921 — a tab, even at a valid width', () => {
    expect(at(`${C}criterion a\n  then\n\t\t\t\tt\n`, 'FUD0921')).toBe('\t\t\t\t');
  });

  it('FUD0922 — no component, at [0, 0)', () => {
    const d = only(OK);
    expect([d.code, d.span]).toEqual(['FUD0922', { start: 0, end: 0 }]);
  });

  it('FUD0923 — a second component, on its keyword, related to the first', () => {
    const source = `${C}component fud-y\n${OK}`;
    const d = only(source);
    expect(d.code).toBe('FUD0923');
    expect(d.span).toEqual({ start: C.length, end: C.length + 'component'.length });
    expect(d.related?.map((r) => slice(source, r.span))).toEqual(['component fud-x']);
    expect(parseSpec(source).value.component?.tag?.text).toBe('fud-x');
  });

  it('FUD0924 — the first component after a criterion still counts', () => {
    const source = `${OK}component fud-x\n`;
    expect(at(source, 'FUD0924')).toBe('component');
    expect(parseSpec(source).value.component?.tag?.text).toBe('fud-x');
  });

  it.each(['component', 'criterion'])('FUD0925 — a bare `%s`, on the keyword', (keyword) => {
    const source = keyword === 'component' ? `component\n${OK}` : `${C}criterion\n`;
    expect(at(source, 'FUD0925')).toBe(keyword);
  });

  it.each([
    ['component fud-x  extra  more # c\n' + OK, 'extra  more'],
    [`${C}criterion a b\n  then\n    t\n`, 'b'],
    [`${C}criterion a\n  then now\n    t\n`, 'now'],
  ])('FUD0926 — extra text, from its first token to its last: %j', (source, extra) => {
    expect(at(source, 'FUD0926')).toBe(extra);
  });

  it('FUD0927 — a repeated slug, on the slug, related to the first', () => {
    const source = `${C}${OK}${OK}`;
    const d = only(source);
    expect(d.code).toBe('FUD0927');
    expect(d.span.start).toBe(source.lastIndexOf('criterion a') + 'criterion '.length);
    expect(d.related?.map((r) => r.span)).toEqual([{ start: C.length + 10, end: C.length + 11 }]);
  });

  it('FUD0928 — an unknown level-0 line, on its first word', () => {
    expect(at(`${C}crit a b\n${OK}`, 'FUD0928')).toBe('crit');
  });

  it('FUD0929 — an unknown level-2 line, on its first word', () => {
    expect(at(`${C}criterion a\n  thn x\n    t\n  then\n    t\n`, 'FUD0929')).toBe('thn');
  });

  it.each([
    ['repeated', 'then', `${C}criterion a\n  then\n    t\n  then\n    u\n`],
    ['out of order', 'given', `${C}criterion a\n  then\n    t\n  given\n    u\n`],
  ])('FUD0930 — a %s block, on its keyword, still in the tree', (_, keyword, source) => {
    const d = only(source);
    expect(d.code).toBe('FUD0930');
    expect(d.span).toEqual({ start: source.lastIndexOf(`  ${keyword}`) + 2, end: source.lastIndexOf(`  ${keyword}`) + 2 + keyword.length });
    expect(parseSpec(source).value.criteria[0]?.blocks.map((b) => b.terms[0]?.name.text)).toEqual(['t', 'u']);
  });

  it('FUD0931 — a block before any criterion', () => {
    expect(at(`${C}  given\n    t\n${OK}`, 'FUD0931')).toBe('given');
  });

  it('FUD0932 — a term without a block, over the whole line', () => {
    expect(at(`${C}criterion a\n    t x y # c\n  then\n    t\n`, 'FUD0932')).toBe('t x y');
  });

  it('FUD0933 — a criterion without then, on its slug', () => {
    expect(at(`${C}criterion a\n  given\n    t\n`, 'FUD0933')).toBe('a');
  });

  it('FUD0934 — an empty block, on its keyword', () => {
    expect(at(`${C}criterion a\n  given\n  then\n    t\n`, 'FUD0934')).toBe('given');
  });

  it.each([
    ['component "fud-x"\n' + OK, '"fud-x"'],
    [`${C}criterion "a"\n  then\n    t\n`, '"a"'],
    [`${C}criterion a\n  then\n    "t" x\n`, '"t"'],
    [`${C}criterion a\n  then\n    t role:\n`, 'role:'],
  ])('FUD0935 — a quoted name or malformed argument: %j', (source, text) => {
    expect(at(source, 'FUD0935')).toBe(text);
  });

  it('keeps a quoted name as written', () => {
    expect(parseSpec(`component "fud-x"\n${OK}`).value.component?.tag?.text).toBe('"fud-x"');
  });

  it('an unclosed quote in a name is only FUD0920', () => {
    expect(at(`component "fud-x\n${OK}`, 'FUD0920')).toBe('"fud-x');
  });

  it('sorts diagnostics by position, even those known when a criterion closes', () => {
    const source = `${C}criterion a\n  given\n  thn\ncrit\n`;
    const { diagnostics } = parseSpec(source);
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0933', 'FUD0934', 'FUD0929', 'FUD0928']);
    const starts = diagnostics.map((d) => d.span.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });
});
