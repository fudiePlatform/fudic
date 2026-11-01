/**
 * SDD-71 §3.2, §3.3 and criteria 5 and 6: `pipe` in an extensions file — how it is read, what
 * it is refused for, and what `fudic:<id>` exports for it. Criterion 7 (the implementation
 * typed by `tsc`) is `emit/pipes-tsc.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import { createApiIndex, emitDeclarations, emitModule, parseApi, validateApi, type Decl, type PipeDecl } from '../src/index.js';
import { codes, slice } from './helpers.js';
import { BUILT_INS, app, check, codesOf } from './project.js';

const lines = (...l: string[]): string => l.join('\n');

const TRUNCAR = lines('# Cuts a text at `max` characters and adds an ellipsis.', 'pipe truncar', '  on str', '  max u32', '');

function pipeOf(source: string, at = 0): PipeDecl {
  const decl: Decl | undefined = parseApi(source).value.declarations[at];
  expect(decl?.kind).toBe('pipe');
  return decl as PipeDecl;
}

describe('pipe is read (SDD-71 §3.2)', () => {
  it('its name, `on`, its parameters and its documentation, every one with its span', () => {
    expect(codes(TRUNCAR)).toEqual([]);
    const pipe = pipeOf(TRUNCAR);
    expect(slice(TRUNCAR, pipe.keyword)).toBe('pipe');
    expect(pipe.name.text).toBe('truncar');
    expect(slice(TRUNCAR, pipe.name.span)).toBe('truncar');
    expect(slice(TRUNCAR, pipe.on!.keyword)).toBe('on');
    expect(slice(TRUNCAR, pipe.on!.span)).toBe('on str');
    expect(pipe.on!.types.map((t) => slice(TRUNCAR, t.span))).toEqual(['str']);
    expect(pipe.params.map((p) => [p.name.text, slice(TRUNCAR, p.type.span)])).toEqual([['max', 'u32']]);
    expect(pipe.doc).toBe('Cuts a text at `max` characters and adds an ellipsis.');
    expect(slice(TRUNCAR, pipe.span)).toBe('pipe truncar\n  on str\n  max u32');
  });

  it('several types after `on` are a union, compound ones included', () => {
    const source = 'pipe p\n  on date f64 map str i32 str[]';
    expect(codes(source)).toEqual([]);
    expect(pipeOf(source).on!.types.map((t) => slice(source, t.span))).toEqual(['date', 'f64', 'map str i32', 'str[]']);
  });

  it('no parameters, and an optional one', () => {
    expect(pipeOf('pipe iniciales\n  on str').params).toEqual([]);
    const source = 'pipe p\n  on str\n  max u32?';
    expect(codes(source)).toEqual([]);
    expect(slice(source, pipeOf(source).params[0]!.type.span)).toBe('u32?');
  });

  it('several pipes in one file', () => {
    const source = lines('pipe a', '  on str', '', 'pipe b', '  on f64');
    expect(codes(source)).toEqual([]);
    expect(parseApi(source).value.declarations.map((d) => d.kind)).toEqual(['pipe', 'pipe']);
  });

  it('it is an extension: beside a rule it is fine, beside a contract it is FUD1078', () => {
    expect(codes(lines('rule r', '  on form', 'pipe p', '  on str'))).toEqual([]);
    expect(codes(lines('load', 'pipe p', '  on str'))).toEqual(['FUD1078']);
    expect(codes(lines('pipe p', '  on str', 'get f'))).toEqual(['FUD1078']);
  });
});

describe('a pipe without `on` (criterion 6, SDD-71 §5)', () => {
  const source = lines('pipe truncar', '  max u32', '', 'pipe iniciales', '  on str', '');

  it('is FUD1340 on its name, and says what is missing', () => {
    const { diagnostics } = parseApi(source);
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD1340']);
    const d = diagnostics[0]!;
    expect(slice(source, d.span)).toBe('truncar');
    expect(d.severity).toBe('error');
    expect(d.message).toBe('a pipe declares what it formats: `on <type>` under `pipe truncar`');
  });

  it('the pipe is still read, and the rest of the file too', () => {
    const { value } = parseApi(source);
    const truncar = pipeOf(source);
    expect(truncar).not.toHaveProperty('on');
    expect(truncar.params.map((p) => p.name.text)).toEqual(['max']);
    expect(value.declarations.map((d) => d.kind === 'pipe' && d.name.text)).toEqual(['truncar', 'iniciales']);
  });

  it('and the index keeps it, so the editor still knows it', () => {
    const index = createApiIndex([app('pipes/truncar', source)]);
    expect(index.all('pipe').map((d) => d.decl.name.text)).toEqual(['truncar', 'iniciales']);
  });

  it('`on` with nothing after it is FUD1063, not FUD1340', () => {
    expect(codes('pipe p\n  on')).toEqual(['FUD1063']);
  });
});

describe('a broken pipe never throws: each mistake is its code', () => {
  const broken: readonly (readonly [string, string, readonly string[]])[] = [
    ['a pipe with no name', 'pipe', ['FUD1063']],
    ['a name in the wrong shape', 'pipe truncarTexto\n  on str', ['FUD1070']],
    ['a word after the name', 'pipe p x\n  on str', ['FUD1064']],
    ['a second `on`', 'pipe p\n  on str\n  on f64', ['FUD1071']],
    ['a broken type after `on`', 'pipe p\n  on str[ i32', ['FUD1067']],
    ['a line under `on`', 'pipe p\n  on str\n    x', ['FUD1065']],
    ['a lone word', 'pipe p\n  on str\n  frob', ['FUD1065']],
  ];
  for (const [what, source, expected] of broken) {
    it(`reports ${what}`, () => {
      expect(() => parseApi(source)).not.toThrow();
      expect(codes(source)).toEqual(expected);
    });
  }
});

describe('a pipe is validated like any project name (criterion 6)', () => {
  it('two `pipe truncar` in the project are FUD1081 on the later one', () => {
    const other = app('pipes/otro', 'pipe truncar\n  on str');
    const { diagnostics } = check('pipe truncar\n  on str', { id: 'pipes/truncar', others: [other] });
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD1081']);
    expect(diagnostics[0]!.related?.map((r) => r.file)).toEqual(['/app/src/pipes/otro.fudapi']);
  });

  it('two in one file are FUD1081 too', () => {
    expect(codesOf('pipe p\n  on str\npipe p\n  on f64')).toEqual(['FUD1081']);
  });

  it('a pipe and a rule may share a name: they are different classes', () => {
    expect(codesOf('pipe required\n  on str')).toEqual([]);
  });

  it('an unknown type after `on` or in a parameter is FUD1080', () => {
    expect(codesOf('pipe p\n  on Pst')).toEqual(['FUD1080']);
    expect(codesOf('pipe p\n  on str\n  max u33')).toEqual(['FUD1080']);
  });

  it('a pipe without `on` validates its parameters and adds nothing to FUD1340', () => {
    const source = app('pipes/p', 'pipe p\n  max u33');
    const index = createApiIndex([...BUILT_INS, source]);
    expect(validateApi(source, index, {}).map((d) => d.code)).toEqual(['FUD1080']);
  });

  it('`on` a type or an enum of the project', () => {
    const post = app('types/post', 'type Post\n  title  str\nenum Estado\n  activo\n  baja');
    expect(codesOf('pipe p\n  on Post Estado', { others: [post] })).toEqual([]);
  });
});

describe('fudic:pipes/<id> — the declarations (criterion 5, SDD-71 §3.3)', () => {
  const dts = (text: string, id = 'pipes/truncar', others: readonly string[][] = []): string => {
    const source = app(id, text);
    const index = createApiIndex([...BUILT_INS, ...others.map(([i, t]) => app(i!, t!)), source]);
    return emitDeclarations(source, index, {});
  };

  it('with parameters: <N>Args, <N>Format and implement, which hands back a function of the args', () => {
    const out = dts(TRUNCAR);
    expect(out).toContain('declare module "fudic:pipes/truncar"');
    expect(out).toContain("import type { Pipe } from '@fudic/core';");
    expect(out).toMatch(/export interface TruncarArgs \{\s*readonly max: number;?\s*\}/u);
    expect(out).toContain('export type TruncarFormat = (value: string, args: TruncarArgs, locale: string) => string;');
    expect(out).toContain('export const truncar: { implement(format: TruncarFormat): (args: TruncarArgs) => Pipe<string> };');
  });

  it('the documentation goes on the value the view imports', () => {
    expect(dts(TRUNCAR)).toMatch(/\/\*\*[^/]*Cuts a text at `max` characters[^/]*\*\/\s*export const truncar/u);
  });

  it('without parameters: no Args, and implement hands back the Pipe itself', () => {
    const out = dts('pipe iniciales\n  on str', 'pipes/iniciales');
    expect(out).not.toContain('Args');
    expect(out).toContain('export type InicialesFormat = (value: string, locale: string) => string;');
    expect(out).toContain('export const iniciales: { implement(format: InicialesFormat): Pipe<string> };');
  });

  it('a kebab-case name is camelCase in TS', () => {
    expect(dts('pipe nombre-corto\n  on str', 'pipes/nombre-corto')).toContain('export const nombreCorto: {');
  });

  it('`on date f64` is Date | number', () => {
    expect(dts('pipe hace\n  on date f64', 'pipes/hace')).toContain('export type HaceFormat = (value: Date | number, locale: string) => string;');
  });

  it('`on Post` is the type Post', () => {
    const out = dts('pipe titulo\n  on Post', 'pipes/titulo', [['types/post', 'type Post\n  title  str']]);
    expect(out).toMatch(/export type TituloFormat = \(value: (import\("fudic:types\/post"\)\.)?Post, locale: string\) => string;/u);
  });

  it('an optional parameter is optional in Args', () => {
    expect(dts('pipe p\n  on str\n  max u32?', 'pipes/p')).toMatch(/readonly max\?: number\b/u);
  });

  it('without `on` the value is unknown: FUD1340 already said why', () => {
    expect(dts('pipe p\n  max u32', 'pipes/p')).toContain('export type PFormat = (value: unknown, args: PArgs, locale: string) => string;');
  });

  it('a file of only rules does not import @fudic/core', () => {
    expect(dts('rule r\n  on form\n  runs both\n  fails r', 'rules/r')).not.toContain('@fudic/core');
  });
});

describe('fudic:pipes/<id> — the module (SDD-71 §3.3)', () => {
  const moduleOf = (text: string, id: string, side: 'server' | 'browser'): string => {
    const source = app(id, text);
    return emitModule(source, createApiIndex([...BUILT_INS, source]), {}, side);
  };

  /** The module's exports, evaluated: it imports nothing, so it runs as it is. */
  const evaluate = (code: string): Record<string, { implement: (format: unknown) => unknown }> => {
    const names = [...code.matchAll(/^export const (\w+)/gmu)].map((m) => m[1]!);
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    return new Function(`${code.replace(/^export const /gmu, 'const ')}\nreturn { ${names.join(', ')} };`)() as never;
  };

  it.each(['server', 'browser'] as const)('on the %s side it imports nothing and registers nothing', (side) => {
    const code = moduleOf(lines(TRUNCAR, 'pipe iniciales', '  on str'), 'pipes/truncar', side);
    expect(code).not.toMatch(/^import /mu);
    expect(code).not.toMatch(/\.handle|\.check|register/u);
  });

  it('implement with parameters: a function of the args that gives a frozen Pipe', () => {
    const { truncar } = evaluate(moduleOf(TRUNCAR, 'pipes/truncar', 'browser'));
    const seen: unknown[] = [];
    const bind = truncar!.implement((value: string, args: { max: number }, locale: string) => {
      seen.push(locale);
      return value.length <= args.max ? value : `${value.slice(0, args.max)}…`;
    }) as (args: { max: number }) => { kind: string; name: string; options: object; format: (v: string, l: string) => string };
    const args = { max: 3 };
    const corto = bind(args);
    args.max = 10;

    expect(corto.kind).toBe('pipe');
    expect(corto.name).toBe('truncar');
    expect(corto.options).toEqual({ max: 3 });
    expect(Object.isFrozen(corto)).toBe(true);
    expect(Object.isFrozen(corto.options)).toBe(true);
    expect(corto.format('fudic', 'es')).toBe('fud…');
    expect(seen).toEqual(['es']);
  });

  it('implement without parameters: the Pipe itself, with empty options', () => {
    const { iniciales } = evaluate(moduleOf('pipe iniciales\n  on str', 'pipes/iniciales', 'server'));
    const pipe = iniciales!.implement((value: string, locale: string) => `${value[0]!}@${locale}`) as {
      kind: string;
      name: string;
      options: object;
      format: (v: string, l: string) => string;
    };

    expect(pipe).toMatchObject({ kind: 'pipe', name: 'iniciales', options: {} });
    expect(Object.isFrozen(pipe)).toBe(true);
    expect(pipe.format('Ada', 'en')).toBe('A@en');
  });

  it('a kebab-case pipe is exported camelCase and named as written', () => {
    const { nombreCorto } = evaluate(moduleOf('pipe nombre-corto\n  on str', 'pipes/nombre-corto', 'browser'));
    expect((nombreCorto!.implement(() => '') as { name: string }).name).toBe('nombre-corto');
  });
});
