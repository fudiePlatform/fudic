import { describe, expect, it } from 'vitest';
import type { SourceDiagnostic } from '@fudic/diagnostics';
import type { Fixtures } from '../src/index.js';
import { BUTTON, FW, WS, termSource, validate, type World } from './terms.js';

const C = 'component fud-button\n';

/** A one-criterion file with `line` under `then`. */
const thenLine = (line: string): string => `${C}criterion a\n  then\n    ${line}\n`;

/** Codes with the text each one points at. */
function found(source: string, world?: World): readonly (readonly [string, string])[] {
  return validate(source, world).map((d) => [d.code, source.slice(d.span.start, d.span.end)] as const);
}

const MIN_HEIGHT: World = {
  files: {
    [`${FW}/then/min-height.js`]: termSource('min-height', 'then', [
      { name: 'target', type: 'element' },
      { name: 'px', type: 'number' },
    ]),
    [`${FW}/then/visible.js`]: termSource('visible', 'then', [{ name: 'target', type: 'element' }]),
  },
};

describe('validateSpec — terms', () => {
  it('accepts a line that resolves and fits', () => {
    expect(validate(thenLine('min-height fud-button 44'), MIN_HEIGHT)).toEqual([]);
  });

  it('FUD0940 — an unknown term, on its name, listing the block (criterion 11)', () => {
    const source = thenLine('max-height fud-button 44');
    const [d] = validate(source, MIN_HEIGHT) as [SourceDiagnostic];
    expect([d.code, source.slice(d.span.start, d.span.end)]).toEqual(['FUD0940', 'max-height']);
    expect(d.message).toContain('min-height, visible');
  });

  it.each(['minHeight', 'MinHeight'])('normalizes %s to min-height (criterion 12)', (term) => {
    expect(validate(thenLine(`${term} fud-button 44`), MIN_HEIGHT)).toEqual([]);
  });

  it('reports the normalized name when it does not exist', () => {
    expect(validate(thenLine('maxHeight x 1'), MIN_HEIGHT)[0]?.message).toContain('`max-height`');
  });

  it('resolves per block (criterion 13)', () => {
    const world: World = { files: { [`${FW}/given/visible.js`]: termSource('visible', 'given') } };
    expect(found(thenLine('visible fud-button'), world)).toEqual([['FUD0940', 'visible']]);
    expect(validate(`${C}criterion a\n  given\n    visible\n  then\n    visible\n`, world).map((d) => d.code)).toEqual([
      'FUD0940',
    ]);
  });

  it('moves a broken module’s problems onto the term, related to the .js, and skips its arguments', () => {
    const path = `${WS}/then/min-height.js`;
    const module = "export const meta = { name: 'max-height', block: 'then', params: [] };";
    const source = thenLine('min-height too many args');
    const diagnostics = validate(source, { files: { [path]: module } });
    expect(diagnostics.map((d) => [d.code, source.slice(d.span.start, d.span.end)])).toEqual([
      ['FUD0942', 'min-height'],
      ['FUD0945', 'min-height'],
      ['FUD0946', 'min-height'],
    ]);
    const [first] = diagnostics;
    expect(first?.file).toBeUndefined();
    expect(first?.related).toEqual([
      { span: { start: module.indexOf("'max-height'"), end: module.indexOf("'max-height'") + 12 }, file: path, message: 'in the term module' },
    ]);
  });

  it('FUD0947 — wrong arity, on the whole line, without checking forms', () => {
    expect(found(thenLine('min-height "x"'), MIN_HEIGHT)).toEqual([['FUD0947', 'min-height "x"']]);
    expect(found(thenLine('min-height fud-button 44 45 # c'), MIN_HEIGHT)).toEqual([
      ['FUD0947', 'min-height fud-button 44 45'],
    ]);
  });
});

describe('validateSpec — parameter types (criterion 16)', () => {
  const world = (type: string): World => ({
    files: { [`${FW}/then/t.js`]: termSource('t', 'then', [{ name: 'p', type }]) },
  });

  it.each([
    ['number', '44'],
    ['number', '-1.5'],
    ['string', '"search"'],
    ['string', 'search'],
    ['token', 'icon'],
    ['element', 'fud-button'],
    ['element', 'role:button'],
    ['element', 'role:button/"Detalles"'],
  ])('%s accepts %s', (type, arg) => {
    expect(validate(thenLine(`t ${arg}`), world(type))).toEqual([]);
  });

  it.each([
    ['number', '"44"'],
    ['number', 'role:button'],
    ['number', 'abc'],
    ['number', 'Infinity'],
    ['string', 'role:button'],
    ['token', '"icon"'],
    ['token', 'role:button'],
    ['element', '"fud-button"'],
    ['element', 'Fud-Button'],
    ['element', '/playground'],
  ])('%s rejects %s with FUD0948 on the argument', (type, arg) => {
    expect(found(thenLine(`t ${arg}`), world(type))).toEqual([['FUD0948', arg]]);
  });
});

describe('validateSpec — component (criterion 17)', () => {
  it('FUD0949 — a tag not in the workspace, on the tag', () => {
    expect(found(`component fud-nope\ncriterion a\n  then\n    visible x\n`, MIN_HEIGHT)).toEqual([
      ['FUD0949', 'fud-nope'],
    ]);
  });

  it('says nothing about a file without a component tag', () => {
    expect(validate('criterion a\n  then\n    visible x\n', MIN_HEIGHT)).toEqual([]);
  });
});

describe('validateSpec — props (criterion 18)', () => {
  const CARD = { tag: 'fud-card', path: '/ws/fud-card.fud', requiredProps: ['title'] } as const;
  const CARD_FIXTURES: Fixtures = {
    path: '/ws/fud-card.fixture.ts',
    names: [
      { text: 'titulo-largo', span: { start: 10, end: 24 } },
      { text: 'vacio', span: { start: 40, end: 45 } },
    ],
  };
  const world: World = { ...MIN_HEIGHT, components: [BUTTON, CARD], fixtures: [CARD_FIXTURES] };
  const card = (body: string): string => `component fud-card\ncriterion a\n${body}`;

  it('accepts a fixture that exists, bare or quoted', () => {
    expect(validate(card('  given\n    props titulo-largo\n  then\n    visible x\n'), world)).toEqual([]);
    expect(validate(card('  given\n    props "vacio"\n  then\n    visible x\n'), world)).toEqual([]);
  });

  it('FUD0950 — an unknown fixture, on the argument, listing the ones there are', () => {
    const source = card('  given\n    props largo\n  then\n    visible x\n');
    const diagnostics = validate(source, world);
    expect(diagnostics.map((d) => [d.code, source.slice(d.span.start, d.span.end)])).toEqual([['FUD0950', 'largo']]);
    expect(diagnostics[0]?.message).toContain('titulo-largo, vacio');
  });

  it('FUD0951 — required props and no `props`, on the slug, or the keyword without one', () => {
    expect(found(card('  then\n    visible x\n'), world)).toEqual([['FUD0951', 'a']]);
    const bare = 'component fud-card\ncriterion\n  then\n    visible x\n';
    expect(found(bare, world)).toEqual([['FUD0951', 'criterion']]);
  });

  it.each([
    ['unknown', 'unknown' as const],
    ['empty', [] as const],
  ])('no FUD0951 when the required props are %s', (_, requiredProps) => {
    const w: World = { ...world, components: [{ ...CARD, requiredProps }] };
    expect(validate(card('  then\n    visible x\n'), w)).toEqual([]);
  });

  it('FUD0952 — props outside given or repeated, on `props`; it still counts for FUD0951', () => {
    expect(found(card('  then\n    props vacio\n'), world)).toEqual([['FUD0952', 'props']]);
    const twice = card('  given\n    props vacio\n    props vacio\n  then\n    visible x\n');
    const d = validate(twice, world);
    expect(d.map((x) => x.code)).toEqual(['FUD0952']);
    expect(d[0]?.span.start).toBe(twice.lastIndexOf('props'));
  });

  it('FUD0953 — props without a fixture file, on `props`', () => {
    const source = `${C}criterion a\n  given\n    props vacio\n  then\n    visible x\n`;
    expect(found(source, world)).toEqual([['FUD0953', 'props']]);
  });

  it('props takes one bare or string argument', () => {
    expect(found(card('  given\n    props\n  then\n    visible x\n'), world)).toEqual([['FUD0947', 'props']]);
    expect(found(card('  given\n    props a b\n  then\n    visible x\n'), world)).toEqual([['FUD0947', 'props a b']]);
    expect(found(card('  given\n    props role:x\n  then\n    visible x\n'), world)).toEqual([['FUD0948', 'role:x']]);
  });

  it('does not look fixtures up without a component tag', () => {
    expect(validate('criterion a\n  given\n    props vacio\n  then\n    visible x\n', world)).toEqual([]);
  });

  it('sorts what it finds by position', () => {
    const source = `component fud-nope\ncriterion a\n  given\n    nope\n  then\n    min-height 1 2\n`;
    expect(validate(source, MIN_HEIGHT).map((d) => d.code)).toEqual(['FUD0949', 'FUD0940', 'FUD0948']);
  });
});
