/**
 * SDD-33 §6.8–§6.10 — the cascade, the cut at the first failure, and the summary.
 */

import { describe, expect, it, vi } from 'vitest';
import { control } from '../src/control.js';
import { form } from '../src/form.js';
import { group } from '../src/group.js';
import type { Validator } from '../src/types.js';
import { atLeast, filled, notEmpty, postSchema } from './fixtures/post.js';

const https: Validator<string> = (v) =>
  v !== '' && !v.startsWith('https://') ? { protocol: true } : null;

describe('$validate (§6.8)', () => {
  it('publishes per node and by path, and answers whether the form is valid', async () => {
    const schema = {
      title: control('', [notEmpty]),
      seo: group({ canonical: control('nope', [https]) }),
    };
    const f = form(schema);

    expect(await f.$validate()).toBe(false);
    expect(f.title.errors()).toEqual({ required: true });
    expect(f.seo.canonical.errors()).toEqual({ protocol: true });
    expect(f.$errors()).toEqual({
      title: { required: true },
      'seo.canonical': { protocol: true },
    });
  });

  it('leaves both null when everything passes', async () => {
    const f = form(postSchema);
    f.$set(filled);

    expect(await f.$validate()).toBe(true);
    expect(f.$errors()).toBeNull();
    expect(f.$summary()).toBeNull();
    expect(f.title.errors()).toBeNull();
  });

  it('clears an error that no longer applies', async () => {
    const f = form({ title: control('', [notEmpty]) });
    await f.$validate();
    expect(f.title.errors()).toEqual({ required: true });

    f.title.set('ya no');
    await f.$validate();
    expect(f.title.errors()).toBeNull();
    expect(f.$errors()).toBeNull();
  });

  it('validates a group on its own, with the group as root', async () => {
    const f = form(postSchema);
    expect(await f.seo.$validate()).toBe(true);
  });
});

describe('one error per field (§6.9)', () => {
  it('runs the validators in order and stops at the first failure', async () => {
    const second = vi.fn(atLeast(3));
    const f = form({ title: control('', [notEmpty, second]) });

    expect(await f.$validate()).toBe(false);
    expect(f.title.errors()).toEqual({ required: true });
    expect(second).not.toHaveBeenCalled();
  });

  it('reaches the second rule when the first one passes', async () => {
    const f = form({ title: control('ab', [notEmpty, atLeast(3)]) });

    expect(await f.$validate()).toBe(false);
    expect(f.title.errors()).toEqual({ minLength: 3 });
  });

  it('hands the root form to every validator, at any depth', async () => {
    const seen: unknown[] = [];
    const ifPublished: Validator<string> = (v, root) => {
      seen.push(root);
      const published = (root as unknown as { published: () => boolean }).published();
      return published && v === '' ? { requiredIfPublished: true } : null;
    };
    const f = form({
      published: control(true),
      seo: group({ description: control('', [ifPublished]) }),
    });

    expect(await f.$validate()).toBe(false);
    expect(f.seo.description.errors()).toEqual({ requiredIfPublished: true });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(f);
  });
});

describe('the form-level rule (§6.10)', () => {
  it('publishes $summary and makes the form invalid with no field in error', async () => {
    const f = form(postSchema, {
      summary: (root) =>
        root.published() && root.seo.description() === ''
          ? { seoRequired: 'A published post needs a description' }
          : null,
    });
    f.$set({ ...filled, seo: { description: '', canonical: 'https://fudie.eu/x' } });

    expect(await f.$validate()).toBe(false);
    expect(f.$errors()).toBeNull();
    expect(f.$summary()).toEqual({ seoRequired: 'A published post needs a description' });
  });

  it('a group carries its own rules, and they land in its summary', async () => {
    const ordered: Validator<{ from: number; to: number }> = (v) =>
      v.from > v.to ? { order: true } : null;
    const range = group({ from: control(10), to: control(1) }, [ordered]);
    const f = form({ range });

    expect(await f.$validate()).toBe(false);
    expect(f.range.$summary()).toEqual({ order: true });
    // A group error is not a field error: the map is about fields.
    expect(f.$errors()).toBeNull();
    expect(f.$summary()).toBeNull();

    f.range.to.set(20);
    expect(await f.$validate()).toBe(true);
    expect(f.range.$summary()).toBeNull();
  });

  it('a form with neither rules nor summary never publishes one', async () => {
    const f = form({ a: control(1) });
    expect(await f.$validate()).toBe(true);
    expect(f.$summary()).toBeNull();
  });

  it('the summary sees the form it belongs to', async () => {
    const summary = vi.fn((_root: unknown) => null);
    const f = form({ a: control(1) }, { summary });

    expect(await f.$validate()).toBe(true);
    expect(summary).toHaveBeenCalledTimes(1);
    expect(summary.mock.calls[0]?.[0]).toBe(f);
  });
});
