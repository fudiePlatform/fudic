/**
 * The rest of `props<T>()` — `const { label, ...resto } = props<T>()` — read and laid out.
 *
 * Two layers. `readRest` (through `extractCode`): which keys a rest gathers, in what order and
 * with what it inherits from `T`, on authentic `@code`. And `rest.ts`: the three rules every
 * writer of the props shares — the local a key arrives in, the groups, and the statement that
 * assembles each rest object — pinned on hand-made `Prop`s, since they are pure.
 */

import { describe, expect, it } from 'vitest';
import { extractCode, type Prop } from '../../src/emit/oxc-code.js';
import { localOf, restAssignments, restGroups } from '../../src/emit/rest.js';
import type { ComponentDocument } from '../../src/document/index.js';
import { bareProps, parse } from './_support.js';

const at = { start: 0, end: 0 };
const named = (name: string): Prop => ({ name, optional: false, at });
const gathered = (name: string, rest: string): Prop => ({ name, optional: true, at, rest });

describe('rest.ts', () => {
  it('localOf: a named prop arrives in its own name, a gathered key in the $ reserve', () => {
    expect(localOf(named('label'))).toBe('label');
    expect(localOf(gathered('placeholder', 'resto'))).toBe('$o_placeholder');
  });

  it('restGroups: each rest with its keys in payload order, named props left out', () => {
    const props = [named('a'), gathered('x', 'r1'), gathered('y', 'r2'), gathered('z', 'r1')];
    expect([...restGroups(props)].map(([rest, keys]) => [rest, keys.map((k) => k.name)])).toEqual([
      ['r1', ['x', 'z']],
      ['r2', ['y']],
    ]);
    expect(restGroups([named('a')]).size).toBe(0);
  });

  it('restAssignments: `let` on the declaration, a bare reassignment on the update', () => {
    const props = [named('label'), gathered('placeholder', 'resto'), gathered('required', 'resto')];
    expect(restAssignments(props, true)).toBe('let resto = { "placeholder": $o_placeholder, "required": $o_required };');
    expect(restAssignments(props, false)).toBe('resto = { "placeholder": $o_placeholder, "required": $o_required };');
  });

  it('restAssignments: one statement per rest, and nothing at all without one', () => {
    expect(restAssignments([gathered('x', 'a'), gathered('y', 'b')], true)).toBe(
      'let a = { "x": $o_x }; let b = { "y": $o_y };',
    );
    expect(restAssignments([named('label')], true)).toBe('');
    expect(restAssignments([], false)).toBe('');
  });
});

const componentDoc = (source: string): ComponentDocument => {
  const doc = parse(source);
  if (doc.type !== 'component-document') throw new Error('expected a component document');
  return doc;
};

/** The props `extractCode` reads off one `@code` line, without their spans. */
function propsOf(code: string): readonly Omit<Prop, 'at'>[] {
  const source = `@code {\n  ${code}\n}\n<m-el>\n  <template shadowrootmode="open"><span></span></template>\n</m-el>\n`;
  return bareProps(extractCode(source, componentDoc(source)).props);
}

describe('readRest — which keys a rest gathers', () => {
  it('every key of T the pattern did not name, in T´s order, after the named ones', () => {
    expect(
      propsOf('const { label, ...resto } = props<{ placeholder?: string; label: string; required: boolean }>();'),
    ).toEqual([
      { name: 'label', optional: false, type: 'string' },
      { name: 'placeholder', optional: true, rest: 'resto', type: 'string' },
      { name: 'required', optional: false, rest: 'resto', type: 'boolean' },
    ]);
  });

  it('inherits the channel of T: a Signal and a callback are gathered as such', () => {
    expect(propsOf('const { ...r } = props<{ v: Signal<number>; f: (n: number) => void }>();')).toEqual([
      { name: 'v', optional: false, rest: 'r', type: 'Signal<number>', channel: 'signal' },
      { name: 'f', optional: false, rest: 'r', type: '(n: number) => void', channel: 'fn' },
    ]);
  });

  it('a key of T with no type annotation is gathered with no type', () => {
    expect(propsOf('const { ...r } = props<{ b }>();')).toEqual([{ name: 'b', optional: false, rest: 'r' }]);
  });

  it('reads a type alias and an interface of the same @code as the literal', () => {
    const expected = [
      { name: 'a', optional: false, type: 'string' },
      { name: 'b', optional: true, rest: 'r', type: 'number' },
    ];
    expect(propsOf('type P = { a: string; b?: number };\n  const { a, ...r } = props<P>();')).toEqual(expected);
    expect(propsOf('interface P { a: string; b?: number }\n  const { a, ...r } = props<P>();')).toEqual(expected);
  });

  it('a T this file cannot read gathers nothing', () => {
    expect(propsOf('const { a, ...r } = props<Foo>();')).toEqual([{ name: 'a', optional: true }]);
    expect(propsOf('const { a, ...r } = props();')).toEqual([{ name: 'a', optional: true }]);
  });

  it('a rest that is not a plain identifier gathers nothing', () => {
    expect(propsOf('const { a, ...{ b } } = props<{ a: string; b: number }>();').filter((p) => 'rest' in p)).toEqual([]);
  });

  it('every key named: the rest gathers none', () => {
    expect(propsOf('const { a, b, ...r } = props<{ a: string; b?: number }>();').filter((p) => 'rest' in p)).toEqual([]);
  });

  it('no rest: nothing is marked', () => {
    expect(propsOf('const { a } = props<{ a: string; b?: number }>();')).toEqual([
      { name: 'a', optional: false, type: 'string' },
    ]);
  });
});
