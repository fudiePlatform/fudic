import { describe, expect, it } from 'vitest';
import { BENCH_FILE, readTermModule, termModule, type BlockKind, type ParamType, type TermParam } from '../../src/index.js';
import { validate, WS } from '../terms.js';

const BLOCKS: readonly BlockKind[] = ['given', 'when', 'then'];
const TYPES: readonly ParamType[] = ['element', 'number', 'string', 'token'];

const read = (block: BlockKind, name: string, params: readonly TermParam[]) =>
  readTermModule(termModule(block, name, params), `${WS}/${block}/${name}.js`, 'workspace', block);

describe('termModule (criterion 4)', () => {
  it.each(BLOCKS)('a `%s` term without params is read clean in the workspace layer', (block) => {
    const module = read(block, 'tiene-sombra', []);
    expect(module.diagnostics).toEqual([]);
    expect(module.name).toBe('tiene-sombra');
    expect(module.params).toEqual([]);
  });

  it.each(BLOCKS.flatMap((block) => TYPES.map((type) => [block, type] as const)))(
    'a `%s` term with a `%s` param is read clean in the workspace layer',
    (block, type) => {
      const params: readonly TermParam[] = [{ name: 'value', type }];
      const module = read(block, 'some-term', params);
      expect(module.diagnostics).toEqual([]);
      expect(module.params).toEqual(params);
    },
  );

  it('keeps every param, in order', () => {
    const params: readonly TermParam[] = TYPES.map((type, i) => ({ name: `p${i}`, type }));
    expect(read('then', 'many', params)).toMatchObject({ diagnostics: [], params });
  });

  it('writes `meta`, a `run` that fails until written and an empty `selfTest`', () => {
    const source = termModule('then', 'tiene-sombra', [
      { name: 'target', type: 'element' },
      { name: 'px', type: 'number' },
    ]);
    expect(source).toBe(
      [
        'export const meta = {',
        "  name: 'tiene-sombra',",
        "  block: 'then',",
        '  params: [',
        "    { name: 'target', type: 'element' },",
        "    { name: 'px', type: 'number' },",
        '  ],',
        '};',
        '',
        "/** @type {import('@fudic/terms').Term<string>['run']} */",
        'export async function run(ctx, { target, px }) {',
        "  return { pass: false, evidence: 'not implemented' };",
        '}',
        '',
        'export const selfTest = [];',
        '',
      ].join('\n'),
    );
  });

  it('without params, `run` takes only the context', () => {
    const source = termModule('given', 'empty', []);
    expect(source).toContain('  params: [],\n');
    expect(source).toContain('export async function run(ctx) {\n');
  });

  it('is a term a `.fudspec` can use without diagnostics', () => {
    const files = {
      [`${WS}/then/tiene-sombra.js`]: termModule('then', 'tiene-sombra', [
        { name: 'target', type: 'element' },
        { name: 'px', type: 'number' },
      ]),
    };
    const spec = ['component fud-button', '', 'criterion sombra', '  then', '    tiene-sombra fud-button 4', ''].join(
      '\n',
    );
    expect(validate(spec, { files })).toEqual([]);
  });
});

describe('termModule — the type of run (SDD-59 §4.8)', () => {
  const BENCH_TYPE =
    "/** @type {import('@fudic/terms').Term<string, import('@fudic/terms').ContextOf<typeof import('../../bench.js').default>>['run']} */\n";

  it('without a fudic/bench.js, run takes the stock ctx', () => {
    const source = termModule('when', 'abre', [{ name: 'target', type: 'element' }]);
    expect(source).toContain("/** @type {import('@fudic/terms').Term<string>['run']} */\nexport async function run(ctx, { target }) {\n");
    expect(termModule('when', 'abre', [], { bench: false })).toBe(termModule('when', 'abre', []));
  });

  it('with one, run takes the ctx the project extension leaves, reached from fudic/terms/<block>/', () => {
    const source = termModule('when', 'abre', [{ name: 'target', type: 'element' }], { bench: true });
    expect(source).toContain(`${BENCH_TYPE}export async function run(ctx, { target }) {\n`);
    // fudic/terms/when/abre.js → ../../bench.js is fudic/bench.js.
    expect(BENCH_FILE).toBe('fudic/bench.js');
  });

  it.each(BLOCKS)('a `%s` term with the bench type is read clean in the workspace layer', (block) => {
    const source = termModule(block, 'con-banco', [{ name: 'target', type: 'element' }], { bench: true });
    const module = readTermModule(source, `${WS}/${block}/con-banco.js`, 'workspace', block);
    expect(module.diagnostics).toEqual([]);
    expect(module.params).toEqual([{ name: 'target', type: 'element' }]);
  });
});
