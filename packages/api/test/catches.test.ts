/**
 * SDD-74 §3.1, §3.2 and criteria 1, 2 and 4 — `catches` in a function: what the parser keeps,
 * where it is not a clause, and what the stub carries.
 */

import { describe, expect, it } from 'vitest';
import { createApiIndex, emitDeclarations, emitModule, parseApi, type Decl } from '../src/index.js';
import { codes, slice } from './helpers.js';
import { app } from './project.js';

type Of<K extends Decl['kind']> = Extract<Decl, { kind: K }>;

function first<K extends Decl['kind']>(source: string, kind: K): Of<K> {
  const decl = parseApi(source).value.declarations[0];
  expect(decl?.kind).toBe(kind);
  return decl as Of<K>;
}

describe('criterion 1: `catches` in a function', () => {
  it.each(['get', 'post', 'put', 'patch', 'delete'])('%s keeps its statuses, with their spans', (verb) => {
    const source = `${verb} save\n  use auth\n  catches 409\n  id      i32`;
    expect(codes(source)).toEqual([]);
    const fn = first(source, 'fn');
    expect(fn.catches!.statuses.map((s) => s.value)).toEqual([409]);
    expect(slice(source, fn.catches!.keyword)).toBe('catches');
    expect(slice(source, fn.catches!.span)).toBe('catches 409');
    expect(fn.args.map((a) => a.name.text)).toEqual(['id']);
  });

  it('goes on any line of the function, and keeps several statuses', () => {
    const source = 'post save\n  id  i32\n  catches 409 422\n  invalidates /usuarios';
    expect(codes(source)).toEqual([]);
    expect(first(source, 'fn').catches!.statuses.map((s) => s.value)).toEqual([409, 422]);
  });

  it('a function without it has no `catches`', () => {
    expect(first('post save\n  id  i32', 'fn')).not.toHaveProperty('catches');
  });

  const broken: readonly (readonly [string, string, readonly string[]])[] = [
    ['`catches` alone', 'post save\n  catches', ['FUD1063']],
    ['a status out of 400–599', 'post save\n  catches 302', ['FUD1075']],
    ['a second `catches`', 'post save\n  catches 409\n  catches 422', ['FUD1071']],
  ];
  for (const [what, source, expected] of broken) {
    it(`reports ${what}`, () => {
      expect(codes(source)).toEqual(expected);
    });
  }

  it('the diagnostics point at the keyword, the status and the second clause', () => {
    const at = (source: string): string => slice(source, parseApi(source).diagnostics[0]!.span);
    expect(at('post save\n  catches')).toBe('catches');
    expect(at('post save\n  catches 302')).toBe('302');
    expect(at('post save\n  catches 409\n  catches 422')).toBe('catches');
  });

  it('a bad status drops only that status; a second clause keeps the first', () => {
    expect(first('post save\n  catches 302 409', 'fn').catches!.statuses.map((s) => s.value)).toEqual([409]);
    expect(first('post save\n  catches 409\n  catches 422', 'fn').catches!.statuses.map((s) => s.value)).toEqual([409]);
    expect(first('post save\n  catches', 'fn')).not.toHaveProperty('catches');
  });
});

// Two words under `load` or a middleware read as a field: `catches 409` is reported as any other
// word followed by a status would be — what that parent already says of a line it does not know.
describe('criterion 2: `catches` where it is not a clause', () => {
  it.each([
    ['load', 'load\n  catches 409', 'load\n  frob 409'],
    ['a middleware', 'middleware m\n  client\n  catches 409', 'middleware m\n  client\n  frob 409'],
  ])('under %s: what an unknown word gets', (_parent, source, unknown) => {
    expect(codes(source)).not.toEqual([]);
    expect(codes(source)).toEqual(codes(unknown));
  });

  it('alone under `load`: the unknown clause, FUD1065', () => {
    expect(codes('load\n  catches')).toEqual(['FUD1065']);
  });
});

describe('criterion 4: what the stub carries', () => {
  const emitted = (fnSource: string) => {
    const source = app('components/c', fnSource);
    const index = createApiIndex([source]);
    return {
      browser: emitModule(source, index, {}, 'browser'),
      server: emitModule(source, index, {}, 'server'),
      dts: emitDeclarations(source, index, {}),
    };
  };

  it('a function with `catches 409 422` carries `catches: [409, 422]`', () => {
    const { browser } = emitted('post save\n  catches 409 422\n  id  i32\n');
    expect(browser).toContain('export const save = stub({');
    expect(browser).toContain('catches: [409, 422]');
  });

  it('without `catches`, no field', () => {
    const { browser, server } = emitted('post save\n  id  i32\n');
    expect(browser).not.toContain('catches');
    expect(server).not.toContain('catches');
  });

  it('the .d.ts of a function with `catches` has no `SaveFails`', () => {
    expect(emitted('post save\n  catches 409\n  id  i32\n').dts).not.toContain('SaveFails');
  });
});
