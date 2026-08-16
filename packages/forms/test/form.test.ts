/**
 * SDD-33 §6.4, §6.7 — a group IS a form, the schema is a template, and `$value()`
 * is a tracked read.
 *
 * The first test is written parameterised by the root, and that is the point: the
 * same assertions have to hold for the form and for a group inside it, because
 * there is no separate implementation for the nested case.
 */

import { describe, expect, it } from 'vitest';
import { effect } from '@fudic/core';
import { control } from '../src/control.js';
import { form } from '../src/form.js';
import { group } from '../src/group.js';
import type { AnyForm } from '../src/types.js';
import { filled, postSchema } from './fixtures/post.js';

describe('a group is a form (§6.4)', () => {
  const roots: readonly [string, () => AnyForm][] = [
    ['form', () => form(postSchema) as unknown as AnyForm],
    ['group', () => form(postSchema).seo as unknown as AnyForm],
  ];

  for (const [name, make] of roots) {
    it(`${name}: exposes the same $ API`, () => {
      const node = make();
      expect(typeof node.$value()).toBe('object');
      expect(node.$errors()).toBeNull();
      expect(node.$summary()).toBeNull();
      expect(node.$fields().length).toBeGreaterThan(0);
      node.$touch();
      node.$reset();
      expect(node.$errors()).toBeNull();
    });
  }

  it('reaches a nested field by name, with no path resolution', () => {
    const f = form(postSchema);
    f.seo.description.set('hola');
    expect(f.seo.description()).toBe('hola');
    expect(f.seo.$value()).toEqual({ description: 'hola', canonical: '' });
  });
});

describe('the schema is a template', () => {
  it('clones its nodes, so two forms never share a value', () => {
    const a = form(postSchema);
    const b = form(postSchema);

    a.title.set('mine');
    expect(b.title()).toBe('');
    expect(postSchema.title()).toBe('');
  });

  it('hands the template back through $schema, untouched', () => {
    const f = form(postSchema);
    expect(f.$schema).toBe(postSchema);
  });

  it('lists its fields in declaration order', () => {
    const f = form(postSchema);
    expect(f.$fields()).toEqual(['title', 'body', 'published', 'seo', 'tags']);
  });

  it('refuses a field in the $ namespace', () => {
    expect(() => form({ $value: control('') })).toThrow(TypeError);
    expect(() => form({ $value: control('') })).toThrow(/reserved/);
  });
});

describe('$value (§6.7)', () => {
  it('is the keyed object, in declaration order, with groups nested', () => {
    const f = form(postSchema);
    f.$set(filled);

    expect(f.$value()).toEqual(filled);
    expect(Object.keys(f.$value())).toEqual(['title', 'body', 'published', 'seo', 'tags']);
  });

  it('is tracked, including through a group', () => {
    const f = form(postSchema);
    const seen: string[] = [];
    const stop = effect(() => {
      seen.push(f.$value().seo.description);
    });
    expect(seen).toEqual(['']);

    f.seo.description.set('nueva');
    expect(seen).toEqual(['', 'nueva']);

    f.title.set('otra cosa');
    expect(seen).toEqual(['', 'nueva', 'nueva']);

    stop();
  });

  it('a group built on its own is a form too', () => {
    const g = group({ a: control(1), b: control(2) });
    expect(g.$value()).toEqual({ a: 1, b: 2 });
    g.a.set(9);
    expect(g.$value()).toEqual({ a: 9, b: 2 });
  });
});
