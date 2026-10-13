/**
 * SDD-56 §3.9 — `$fresh()`: a new form with this one's schema, rules and options, in its
 * initial state. What a server validates each request on, because the exported form is one
 * for every request at once.
 */

import { describe, expect, expectTypeOf, it } from 'vitest';
import { control } from '../src/control.js';
import { form } from '../src/form.js';
import { group } from '../src/group.js';
import { serverValidator } from '../src/validators/server.js';
import type { AnyForm, Errors, Form, Validator } from '../src/types.js';
import { filled, notEmpty, postSchema } from './fixtures/post.js';

describe('$fresh', () => {
  it('is a new instance, typed as the form it came from', () => {
    const f = form(postSchema);
    const copy = f.$fresh();
    expect(copy).not.toBe(f);
    expectTypeOf(copy).toEqualTypeOf<Form<typeof postSchema>>();
    // Still an AnyForm, which is why it is typed `this`.
    expectTypeOf(copy).toMatchTypeOf<AnyForm>();
  });

  it('keeps the schema, the very same template', () => {
    const f = form(postSchema);
    expect(f.$fresh().$schema).toBe(f.$schema);
    expect(f.$fresh().$fields()).toEqual(f.$fields());
  });

  it('starts in the initial state, whatever the original went through', async () => {
    const f = form(postSchema);
    f.$set(filled);
    f.$touch();
    await f.$validate();

    const copy = f.$fresh();
    expect(copy.$value()).toEqual(form(postSchema).$value());
    expect(copy.$errors()).toBeNull();
    expect(copy.$summary()).toBeNull();
    expect(copy.title.touched()).toBe(false);
  });

  it('is independent of the original, groups included, in both directions', () => {
    const f = form(postSchema);
    const copy = f.$fresh();

    copy.$set(filled);
    expect(f.title()).toBe('');
    expect(f.seo.description()).toBe('');

    f.seo.canonical.set('https://a.test');
    expect(copy.seo.canonical()).toBe('https://fudie.eu/x');
    expect(copy.seo).not.toBe(f.seo);
  });

  it('two copies do not share an instance either', () => {
    const f = form(postSchema);
    const a = f.$fresh();
    const b = f.$fresh();
    a.title.set('uno');
    expect(b.title()).toBe('');
  });

  it('keeps the rules of the controls', async () => {
    const copy = form(postSchema).$fresh();
    expect(await copy.$validate()).toBe(false);
    expect(copy.title.errors()).toEqual({ required: true });
  });

  it('keeps a server rule, which only runs with { server: true }', async () => {
    const taken = serverValidator<string>((v) => (v === 'ana' ? { taken: true } : null));
    const f = form({ name: control('', [taken]) });
    const copy = f.$fresh();
    copy.name.set('ana');
    expect(await copy.$validate()).toBe(true);
    expect(await copy.$validate({ server: true })).toBe(false);
    expect(copy.$errors()).toEqual({ name: { taken: true } });
  });

  it('keeps the options: the summary rule of the form', async () => {
    const schema = { a: control(''), b: control('') };
    const mismatch = (root: Form<typeof schema>): Errors | null =>
      root.a() !== root.b() ? { mismatch: true } : null;
    const f = form(schema, { summary: mismatch });

    const copy = f.$fresh();
    copy.a.set('x');
    expect(await copy.$validate()).toBe(false);
    expect(copy.$summary()).toEqual({ mismatch: true });
  });

  it('keeps the rules of a group, which are its summary', async () => {
    const same: Validator<{ x: string; y: string }> = (v) => (v.x !== v.y ? { same: true } : null);
    const fields = { x: control('', [notEmpty]), y: control('') };
    const f = form({ pair: group(fields, [same]) });
    const copy = f.$fresh();
    copy.pair.x.set('1');
    expect(await copy.$validate()).toBe(false);
    expect(copy.pair.$summary()).toEqual({ same: true });
  });
});
