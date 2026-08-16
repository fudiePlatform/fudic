/**
 * SDD-33 §6.13–§6.14 — errors that arrive from outside, and the two cascades.
 *
 * This is the only place in the package where a path is resolved at runtime, and
 * it is justified by where the data comes from: a 422 is keyed by path because the
 * other end generated it. Everything else reaches a node through the property
 * chain the author — or the compiler — wrote.
 */

import { describe, expect, it } from 'vitest';
import { control } from '../src/control.js';
import { form } from '../src/form.js';
import { group } from '../src/group.js';
import { filled, notEmpty, postSchema } from './fixtures/post.js';

describe('$setErrors (§6.13)', () => {
  it('publishes on the control and marks it, and only it, touched', () => {
    const f = form(postSchema);
    f.$setErrors({ 'seo.canonical': { protocol: true } });

    expect(f.seo.canonical.errors()).toEqual({ protocol: true });
    expect(f.seo.canonical.touched()).toBe(true);
    expect(f.seo.description.touched()).toBe(false);
    expect(f.title.touched()).toBe(false);
    expect(f.$errors()).toEqual({ 'seo.canonical': { protocol: true } });
  });

  it('ignores a path this schema does not have, without throwing', () => {
    const f = form(postSchema);
    f.$setErrors({
      title: { taken: true },
      nope: { whatever: true },
      'seo.nope': { whatever: true },
      'title.deeper': { whatever: true },
    });

    expect(f.title.errors()).toEqual({ taken: true });
    expect(f.$errors()).toEqual({ title: { taken: true } });
  });

  it('a path that names a group publishes on the group summary', () => {
    const f = form({ seo: group({ canonical: control('') }) });
    f.$setErrors({ seo: { incomplete: true } });

    expect(f.seo.$summary()).toEqual({ incomplete: true });
    expect(f.$errors()).toBeNull();
  });

  it('takes the form-level error when it is given one, and leaves it alone when not', () => {
    const f = form(postSchema);

    f.$setErrors({}, { seoRequired: true });
    expect(f.$summary()).toEqual({ seoRequired: true });

    f.$setErrors({ title: { taken: true } });
    expect(f.$summary()).toEqual({ seoRequired: true });

    f.$setErrors({}, null);
    expect(f.$summary()).toBeNull();
  });

  it('$setErrors(null) clears the whole tree, summary included', () => {
    const f = form(postSchema);
    f.$setErrors({ title: { taken: true }, 'seo.canonical': { protocol: true } }, { s: true });

    f.$setErrors(null);
    expect(f.$errors()).toBeNull();
    expect(f.$summary()).toBeNull();
    expect(f.title.errors()).toBeNull();
    expect(f.seo.canonical.errors()).toBeNull();
    // Clearing an error is not un-touching a field: the user was still there.
    expect(f.title.touched()).toBe(true);
  });

  it('publishing null on a control clears it without touching it', () => {
    const f = form({ title: control('') });
    f.$setErrors({ title: null as never });

    expect(f.title.errors()).toBeNull();
    expect(f.title.touched()).toBe(false);
  });
});

describe('$touch and $reset (§6.14)', () => {
  it('$touch marks every control, groups included', () => {
    const f = form(postSchema);
    f.$touch();

    expect(f.title.touched()).toBe(true);
    expect(f.tags.touched()).toBe(true);
    expect(f.seo.description.touched()).toBe(true);
    expect(f.seo.canonical.touched()).toBe(true);
  });

  it('$reset leaves the form as newly built', async () => {
    const f = form(postSchema, { summary: () => ({ nope: true }) });
    f.$set(filled);
    f.$touch();
    await f.$validate();

    expect(f.$summary()).toEqual({ nope: true });

    f.$reset();

    expect(f.$value()).toEqual({
      title: '',
      body: '',
      published: false,
      seo: { description: '', canonical: '' },
      tags: [],
    });
    expect(f.$errors()).toBeNull();
    expect(f.$summary()).toBeNull();
    expect(f.title.touched()).toBe(false);
    expect(f.title.dirty()).toBe(false);
    expect(f.seo.description.touched()).toBe(false);
  });

  it('$reset drops a validation that was still in flight', async () => {
    let release = (): void => {};
    const slow = () =>
      new Promise<{ boom: true } | null>((resolve) => {
        release = () => {
          resolve({ boom: true });
        };
      });
    const f = form({ title: control('', [notEmpty]) }, { summary: slow });

    const run = f.$validate();
    // The form-level rule is only reached once the fields have been awaited.
    await new Promise((resolve) => setTimeout(resolve, 0));
    f.$reset();
    release();
    await run;

    expect(f.$summary()).toBeNull();
  });
});
