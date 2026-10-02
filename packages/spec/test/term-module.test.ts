import { describe, expect, it } from 'vitest';
import { readTermModule, type BlockKind, type Layer } from '../src/index.js';
import { termSource } from './terms.js';

const PATH = '/ws/fudic/terms/then/min-height.js';

const read = (source: string, layer: Layer = 'framework', block: BlockKind = 'then', path = PATH) =>
  readTermModule(source, path, layer, block);

/** Codes and the text each one points at, in the module. */
function problems(source: string, layer: Layer = 'framework'): readonly (readonly [string, string])[] {
  return read(source, layer).diagnostics.map((d) => [d.code, source.slice(d.span.start, d.span.end)] as const);
}

const TAIL = '\nexport function run() {}';

describe('readTermModule — a sound module', () => {
  it('reads name, block, params and describe', () => {
    const source = [
      'export const meta = {',
      "  name: 'min-height',",
      "  block: 'then',",
      "  params: [{ name: 'target', type: 'element' }, { name: 'px', type: 'number' }],",
      '  describe: ({ target, px }) => `${target} ${px}px`,',
      '};',
      'export async function run(ctx) {}',
      'export const selfTest = [];',
    ].join('\n');
    expect(read(source, 'workspace')).toEqual({
      layer: 'workspace',
      path: PATH,
      block: 'then',
      name: 'min-height',
      params: [
        { name: 'target', type: 'element' },
        { name: 'px', type: 'number' },
      ],
      describe: '({ target, px }) => `${target} ${px}px`',
      diagnostics: [],
    });
  });

  it('accepts every closed type, quoted keys, wrappers and `export const run =`', () => {
    const source = [
      "export const meta = ({ 'name': 'min-height', block: ('then'), params: [",
      "  { name: 'a', type: 'element' }, { name: 'b', type: 'number' },",
      "  { name: 'c', type: 'string' }, { name: 'd', type: ('token') },",
      '] });',
      'export const run = async () => {};',
    ].join('\n');
    const module = read(source);
    expect(module.diagnostics).toEqual([]);
    expect(module.params.map((p) => p.type)).toEqual(['element', 'number', 'string', 'token']);
    expect(module.describe).toBeUndefined();
  });

  it('takes the term from a Windows path too', () => {
    expect(read(termSource('visible', 'given'), 'framework', 'given', 'C:\\fw\\terms\\given\\visible.js').name).toBe(
      'visible',
    );
  });
});

describe('readTermModule — static reading (criterion 14)', () => {
  it('never runs the module: a top-level throw changes nothing', () => {
    const source = `throw new Error('ran');\n${termSource('min-height', 'then')}`;
    expect(read(source, 'workspace').diagnostics).toEqual([]);
  });

  it.each([
    ['a call', 'export const meta = makeMeta();', 'meta'],
    ['a number', 'export const meta = 1;', 'meta'],
    ['a declaration without a value', 'export let meta;', 'meta'],
    ['a function', 'export function meta() {}', 'meta'],
  ])('a meta that is %s is FUD0941 on its name', (_, source, text) => {
    expect(problems(`${source}${TAIL}`)).toEqual([['FUD0941', text]]);
  });

  it.each([
    ['missing', 'export const other = {};'],
    ['re-exported', 'const meta = {};\nexport { meta };'],
    ['destructured', 'export const { meta } = x;'],
    ['a class', 'export class meta {}'],
  ])('a meta %s is FUD0941 at [0, 0)', (_, source) => {
    const d = read(`${source}${TAIL}`).diagnostics;
    expect(d.map((x) => [x.code, x.span])).toEqual([['FUD0941', { start: 0, end: 0 }]]);
    expect(d[0]?.file).toBe(PATH);
  });

  it('a syntax error is one FUD0941 at [0, 0) with the parser message', () => {
    const module = read('export const meta = {');
    expect(module.diagnostics.map((d) => [d.code, d.span])).toEqual([['FUD0941', { start: 0, end: 0 }]]);
    expect(module.diagnostics[0]?.message.length).toBeGreaterThan('the term module'.length);
    expect(module.params).toEqual([]);
  });

  it.each([
    ['name', "export const meta = { name: nameOf(), block: 'then', params: [] };"],
    ['name', "export const meta = { block: 'then', params: [] };"],
    ['block', "export const meta = { name: 'min-height', block: `then`, params: [] };"],
    ['params', "export const meta = { name: 'min-height', block: 'then' };"],
    ['params', "export const meta = { name: 'min-height', block: 'then', params: list };"],
    ['name', "export const meta = { [key]: 'min-height', block: 'then', params: [] };"],
    ['name', "export const meta = { 1: 'min-height', block: 'then', params: [] };"],
    ['name', "export const meta = { ...base, block: 'then', params: [] };"],
  ])('a `%s` that is not a literal is FUD0941 on meta', (field, source) => {
    const module = read(`${source}${TAIL}`);
    expect(module.diagnostics.map((d) => d.code)).toEqual(['FUD0941']);
    expect(module.diagnostics[0]?.message).toContain(`meta.${field}`);
    const d = module.diagnostics[0]!;
    expect(source.slice(d.span.start, d.span.end).startsWith('{')).toBe(true);
  });

  it.each([
    ['a hole', "[{ name: 'a', type: 'token' }, , { name: 'b', type: 'token' }]", "[{ name: 'a', type: 'token' }, , { name: 'b', type: 'token' }]"],
    ['a spread', '[...more]', '...more'],
    ['not an object', "['a']", "'a'"],
    ['a param without type', "[{ name: 'a' }]", "{ name: 'a' }"],
    ['a param with a computed name', "[{ name: n, type: 'token' }]", "{ name: n, type: 'token' }"],
  ])('params with %s is FUD0941 there, and the rest is still read', (_, list, text) => {
    const source = `export const meta = { name: 'min-height', block: 'then', params: ${list} };${TAIL}`;
    expect(problems(source)).toEqual([['FUD0941', text]]);
  });
});

describe('readTermModule — coherence (criterion 15)', () => {
  const meta = (fields: string) => `export const meta = { ${fields} };`;

  it('FUD0942 — a name that is not the file name, on the literal', () => {
    expect(problems(`${meta("name: 'minHeight', block: 'then', params: []")}${TAIL}`)).toEqual([
      ['FUD0942', "'minHeight'"],
    ]);
  });

  it('FUD0943 — a block that is not the folder, on the literal', () => {
    expect(problems(`${meta("name: 'min-height', block: 'given', params: []")}${TAIL}`)).toEqual([
      ['FUD0943', "'given'"],
    ]);
  });

  it('FUD0944 — a type outside the closed list, on the literal', () => {
    const source = `${meta("name: 'min-height', block: 'then', params: [{ name: 'px', type: 'pixels' }]")}${TAIL}`;
    expect(problems(source)).toEqual([['FUD0944', "'pixels'"]]);
    expect(read(source).params).toEqual([]);
  });

  it('FUD0945 — no run, at [0, 0)', () => {
    const module = read(meta("name: 'min-height', block: 'then', params: []"));
    expect(module.diagnostics.map((d) => [d.code, d.span])).toEqual([['FUD0945', { start: 0, end: 0 }]]);
  });

  it('FUD0946 — no selfTest in the workspace layer only', () => {
    const source = `${meta("name: 'min-height', block: 'then', params: []")}${TAIL}`;
    expect(problems(source, 'workspace')).toEqual([['FUD0946', '']]);
    expect(problems(source, 'framework')).toEqual([]);
  });

  it('FUD0954 — a repeated parameter name, on the second, which is dropped', () => {
    const source = `${meta(
      "name: 'min-height', block: 'then', params: [{ name: 'a', type: 'token' }, { name: 'a', type: 'number' }]",
    )}${TAIL}`;
    const module = read(source);
    expect(module.diagnostics.map((d) => [d.code, source.slice(d.span.start, d.span.end), d.span.start])).toEqual([
      ['FUD0954', "'a'", source.lastIndexOf("'a'")],
    ]);
    expect(module.params).toEqual([{ name: 'a', type: 'token' }]);
  });

  it('every diagnostic names the module file', () => {
    const module = read('export const meta = 1;', 'workspace');
    expect(module.diagnostics.map((d) => d.code)).toEqual(['FUD0941', 'FUD0945', 'FUD0946']);
    expect(module.diagnostics.every((d) => d.file === PATH)).toBe(true);
  });
});
