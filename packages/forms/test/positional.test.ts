/**
 * SDD-56 §3.10 and §4.17 — a form without its keys, and back.
 *
 * `$positional` walks `Object.keys(schema)` in declaration order with a group as its own
 * nested array; `$set` takes an array by position and an object by key, refusing a length
 * that is not the schema's without touching the form. `undefined` never crosses: it is
 * `null`, at any depth, and the user's value is never mutated to get there.
 */

import { describe, expect, it } from 'vitest';
import { effect } from '@fudic/core';
import { control } from '../src/control.js';
import { form } from '../src/form.js';
import { group } from '../src/group.js';
import { normalize, toKeyed, toPositional } from '../src/positional.js';
import { filled, postSchema } from './fixtures/post.js';

describe('$positional (§4.17)', () => {
  it('is the array of SDD-forms-posicional §4.1: declaration order, the group nested', () => {
    const f = form(postSchema);
    f.$set(filled);
    expect(f.$positional()).toEqual([
      'Arquitectura de Fudic',
      'Cuerpo del post.',
      true,
      ['Descripción SEO', 'https://fudie.eu/x'],
      ['web', 'compilador'],
    ]);
  });

  it('carries no key at all', () => {
    const f = form(postSchema);
    f.$set(filled);
    const wire = JSON.stringify(f.$positional());
    for (const key of ['title', 'body', 'published', 'seo', 'description', 'canonical', 'tags']) {
      expect(wire).not.toContain(`"${key}"`);
    }
  });

  it('fixed arity: false, empty string and null keep their place', () => {
    const f = form({ a: control(false), b: control(''), c: control<string | null>(null), d: control(0) });
    expect(f.$positional()).toEqual([false, '', null, 0]);
  });

  it('a control whose value is an object travels with its shape', () => {
    const f = form({ meta: control({ k: 1, list: [{ x: 1 }] }) });
    expect(f.$positional()).toEqual([{ k: 1, list: [{ x: 1 }] }]);
  });

  it('is tracked: an effect reading it re-runs when a field changes', () => {
    const f = form(postSchema);
    const seen: unknown[] = [];
    const stop = effect(() => {
      seen.push(f.$positional()[0]);
    });
    f.title.set('otro');
    stop();
    expect(seen).toEqual(['', 'otro']);
  });
});

describe('$set with an array (§4.17)', () => {
  it('assigns by position, a nested array into its group', () => {
    const f = form(postSchema);
    f.$set(['T', 'B', true, ['D', 'https://c'], ['x']]);
    expect(f.$value()).toEqual({
      title: 'T',
      body: 'B',
      published: true,
      seo: { description: 'D', canonical: 'https://c' },
      tags: ['x'],
    });
  });

  it('round trip: $set($positional()) gives back the same $value()', () => {
    const a = form(postSchema);
    a.$set(filled);
    const b = form(postSchema);
    b.$set(a.$positional());
    expect(b.$value()).toEqual(a.$value());
  });

  it('an object still assigns by key', () => {
    const f = form(postSchema);
    f.$set(filled);
    expect(f.$value()).toEqual(filled);
  });

  it('one position fewer is a RangeError and the form stays as it was', () => {
    const f = form(postSchema);
    f.$set(filled);
    expect(() => f.$set(['T', 'B', true, ['D', 'https://c']])).toThrow(RangeError);
    expect(() => f.$set(['T', 'B', true, ['D', 'https://c']])).toThrow('expected 5 positions, got 4');
    expect(f.$value()).toEqual(filled);
  });

  it('one position too many is a RangeError too', () => {
    const f = form(postSchema);
    expect(() => f.$set(['T', 'B', true, ['D', 'C'], [], 'extra'])).toThrow(RangeError);
    expect(f.title()).toBe('');
  });

  it('a wrong length inside a group names its path', () => {
    const f = form(postSchema);
    expect(() => f.$set(['T', 'B', true, ['D'], []])).toThrow('expected 2 positions at "seo", got 1');
    expect(f.title()).toBe('');
  });

  it('a group that is not an array is a TypeError naming it', () => {
    const f = form(postSchema);
    expect(() => f.$set(['T', 'B', true, { description: 'D' }, []] as never)).toThrow(
      new TypeError('$set: expected an array at "seo"'),
    );
    expect(f.title()).toBe('');
  });

  it('nested groups name the whole path', () => {
    const schema = { outer: group({ inner: group({ a: control(''), b: control('') }) }) };
    const f = form(schema);
    expect(() => f.$set([[['only']]])).toThrow('at "outer.inner"');
    expect(() => f.$set([['nope']])).toThrow('expected an array at "outer.inner"');
    f.$set([[['x', 'y']]]);
    expect(f.$value()).toEqual({ outer: { inner: { a: 'x', b: 'y' } } });
  });
});

describe('undefined does not cross (§4.17)', () => {
  it('undefined, a function and a symbol are null, at any depth', () => {
    const value = {
      a: undefined,
      b: () => 1,
      c: Symbol('s'),
      d: { e: undefined, f: [undefined, 1, { g: () => 2 }] },
    };
    expect(normalize(value, [])).toEqual({ a: null, b: null, c: null, d: { e: null, f: [null, 1, { g: null }] } });
  });

  it('a control holding undefined travels as null, without mutating what the user holds', () => {
    const inner = { keep: undefined as string | undefined, list: [undefined] };
    const f = form({ meta: control<unknown>(inner), plain: control<unknown>(undefined) });
    expect(f.$positional()).toEqual([{ keep: null, list: [null] }, null]);
    expect(inner).toEqual({ keep: undefined, list: [undefined] });
    expect('keep' in inner).toBe(true);
  });

  it('what is neither a plain object nor an array passes as it is', () => {
    const when = new Date(0);
    const map = new Map([[1, 2]]);
    expect(normalize(when, [])).toBe(when);
    expect(normalize(map, [])).toBe(map);
    expect(normalize([when], [])).toEqual([when]);
  });

  it('an object without prototype is walked like a plain one', () => {
    const bare = Object.create(null) as Record<string, unknown>;
    bare['x'] = undefined;
    expect(normalize(bare, [])).toEqual({ x: null });
  });

  it('primitives pass, null stays null', () => {
    for (const v of [0, '', false, null, 1n, 'x']) expect(normalize(v, [])).toBe(v);
  });

  it('a circular reference is a TypeError of its own', () => {
    const loop: Record<string, unknown> = { a: 1 };
    loop['self'] = loop;
    expect(() => normalize(loop, [])).toThrow(new TypeError('a form value cannot contain itself: circular reference'));
    const list: unknown[] = [];
    list.push([list]);
    expect(() => normalize(list, [])).toThrow(TypeError);
  });

  it('a cycle in a form value fails $positional', () => {
    const loop: Record<string, unknown> = {};
    loop['me'] = loop;
    const f = form({ x: control<unknown>(loop) });
    expect(() => f.$positional()).toThrow(/circular reference/u);
  });

  it('a reference two siblings share is not a cycle', () => {
    const shared = { n: 1 };
    expect(normalize({ a: shared, b: shared, c: [shared, shared] }, [])).toEqual({
      a: { n: 1 },
      b: { n: 1 },
      c: [{ n: 1 }, { n: 1 }],
    });
  });
});

describe('the two walks, directly', () => {
  it('toPositional and toKeyed are inverse over a schema', () => {
    const keyed = { title: 't', body: 'b', published: false, seo: { description: 'd', canonical: 'c' }, tags: [] };
    const positional = toPositional(postSchema, keyed);
    expect(positional).toEqual(['t', 'b', false, ['d', 'c'], []]);
    expect(toKeyed(postSchema, positional)).toEqual(keyed);
  });
});
