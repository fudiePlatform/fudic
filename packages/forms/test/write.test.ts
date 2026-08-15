/**
 * SDD-33 §6.5–§6.6 — `$set` is total, `$patch` is partial, and a failed write
 * leaves the form exactly as it was.
 *
 * The two are named apart on purpose. The prototype had a single operation with
 * total meaning, so an object that did not mention a field emptied it: a `PATCH`
 * body carrying three fields of twelve blanked the other nine and sent them back.
 */

import { describe, expect, it } from 'vitest';
import { control } from '../src/control.js';
import { form } from '../src/form.js';
import { group } from '../src/group.js';
import { filled, postSchema } from './fixtures/post.js';

const complete = () => {
  const f = form(postSchema);
  f.$set(filled);
  return f;
};

describe('$set is total (§6.5)', () => {
  it('writes every field', () => {
    const f = complete();
    expect(f.title()).toBe(filled.title);
    expect(f.published()).toBe(true);
    expect(f.seo.canonical()).toBe(filled.seo.canonical);
    expect(f.tags()).toEqual(['web', 'compilador']);
  });

  it('throws naming the missing field, and writes nothing', () => {
    const f = complete();
    const partial = { ...filled } as Record<string, unknown>;
    delete partial['body'];

    expect(() => f.$set(partial as never)).toThrow(TypeError);
    expect(() => f.$set(partial as never)).toThrow(/missing field "body"/);
    // Intact: the check runs whole before the first write.
    expect(f.$value()).toEqual(filled);
  });

  it('throws naming a field the schema does not have, and writes nothing', () => {
    const f = complete();
    const extra = { ...filled, nope: 1 };

    expect(() => f.$set(extra as never)).toThrow(/unknown field "nope"/);
    expect(f.$value()).toEqual(filled);
  });

  it('reports the missing field of a group by its path', () => {
    const f = form(postSchema);
    const broken = { ...filled, seo: { description: 'x' } };

    expect(() => f.$set(broken as never)).toThrow(/missing field "seo.canonical"/);
    // Nothing was written, not even the fields declared before the group.
    expect(f.title()).toBe('');
  });

  it('refuses a value that is not an object, at the root and inside a group', () => {
    const f = form(postSchema);
    expect(() => f.$set(null as never)).toThrow(/expected an object/);
    expect(() => f.$set([] as never)).toThrow(/expected an object/);
    expect(() => f.$set({ ...filled, seo: 'nope' } as never)).toThrow(
      /expected an object at "seo"/,
    );
  });
});

describe('$patch is partial (§6.6)', () => {
  it('touches only what it mentions', () => {
    const f = complete();
    f.$patch({ title: 'otro' });

    expect(f.title()).toBe('otro');
    expect(f.body()).toBe(filled.body);
    expect(f.published()).toBe(true);
    expect(f.seo.$value()).toEqual(filled.seo);
    expect(f.tags()).toEqual(['web', 'compilador']);
  });

  it('goes into a group without emptying its siblings', () => {
    const f = complete();
    f.$patch({ seo: { canonical: 'https://otra' } });

    expect(f.seo.canonical()).toBe('https://otra');
    expect(f.seo.description()).toBe(filled.seo.description);
  });

  it('still refuses an unknown field, by path', () => {
    const f = complete();
    expect(() => f.$patch({ seo: { nope: 1 } } as never)).toThrow(/unknown field "seo.nope"/);
    expect(f.$value()).toEqual(filled);
  });

  it('accepts an empty patch', () => {
    const f = complete();
    f.$patch({});
    expect(f.$value()).toEqual(filled);
  });
});

describe('writing a group directly', () => {
  it('works the same, because a group is a form', () => {
    const g = group({ a: control(1), b: control(2) });
    g.$patch({ b: 9 });
    expect(g.$value()).toEqual({ a: 1, b: 9 });

    expect(() => g.$set({ a: 1 } as never)).toThrow(/missing field "b"/);
    g.$set({ a: 3, b: 4 });
    expect(g.$value()).toEqual({ a: 3, b: 4 });
  });
});
