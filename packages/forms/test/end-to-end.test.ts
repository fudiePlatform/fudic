/**
 * The whole library, one circuit at a time, with real data.
 *
 * The rest of the suite pins one behaviour per file, which is what makes a failure
 * point at one place. This file does the opposite on purpose: it plays the life of
 * a form from the payload that arrives to the payload that leaves, and it is the
 * test that would catch two correct pieces that do not fit each other.
 *
 * Two circuits, because the two are different products: a text form, where the
 * rules are about content, and a strictly typed one, where the DECLARED WIDTH does
 * the refusing.
 */

import { describe, expect, it } from 'vitest';
import { form } from '../src/form.js';
import { blogForm, stored } from './fixtures/blog.js';
import { orderLine } from './fixtures/order-line.js';

describe('a blog post, from the payload in to the payload out', () => {
  it('receives, edits, refuses, is corrected, and hands back what travels', async () => {
    const f = blogForm();

    // ── 1. it receives ────────────────────────────────────────────────────
    // The form starts empty; the server hands over an existing post.
    expect(f.$value()).toEqual({
      title: '',
      body: '',
      published: false,
      seo: { description: '', canonical: '' },
      tags: [],
    });

    f.$set(stored);

    // What came in is what it holds, nested groups included.
    expect(f.$value()).toEqual(stored);
    expect(f.title()).toBe(stored.title);
    expect(f.seo.canonical()).toBe(stored.seo.canonical);
    // Loading is NOT editing. An edit page fills its fields from the server and
    // the user has not touched anything yet, so nothing is dirty and nothing is
    // touched — otherwise every edit page would open with unsaved changes.
    expect(f.title.dirty()).toBe(false);
    expect(f.title.touched()).toBe(false);
    expect(f.seo.description.dirty()).toBe(false);
    expect(await f.$validate()).toBe(true);

    // ── 2. the user breaks three things ───────────────────────────────────
    f.title.set('ab'); // too short
    f.seo.canonical.set('http://fudie.eu'); // not https
    f.seo.description.set(''); // and the post is published

    expect(await f.$validate()).toBe(false);

    // Every failure lands on its own field, and the map is keyed by path.
    expect(f.title.errors()).toEqual({ minLength: 3 });
    expect(f.seo.canonical.errors()).toEqual({ pattern: '^https:\\/\\/' });
    expect(f.$errors()).toEqual({
      title: { minLength: 3 },
      'seo.canonical': { pattern: '^https:\\/\\/' },
    });
    // The rule that belongs to no field is the summary.
    expect(f.$summary()).toEqual({ seoRequired: 'A published post needs an SEO description' });
    // And what the user changed is dirty, which is how a UI knows what to save.
    expect(f.title.dirty()).toBe(true);
    expect(f.body.dirty()).toBe(false);

    // ── 3. one error per field, in declaration order ──────────────────────
    f.title.set('');
    await f.$validate();
    // Empty fails `required`, and `minLength` never gets to speak.
    expect(f.title.errors()).toEqual({ required: true });

    // A published post with an empty body: the rule reads a sibling field.
    f.body.set('  ');
    await f.$validate();
    expect(f.body.errors()).toEqual({ requiredIfPublished: true });

    // ── 4. corrected ──────────────────────────────────────────────────────
    f.$patch({
      title: 'Arquitectura de Fudic, revisada',
      body: stored.body,
      seo: { canonical: 'https://fudie.eu/blog/arquitectura', description: 'Descripción' },
    });

    expect(await f.$validate()).toBe(true);
    expect(f.$errors()).toBeNull();
    expect(f.$summary()).toBeNull();

    // ── 5. what leaves ────────────────────────────────────────────────────
    // The object to send: the fields that were not patched are still what the
    // server sent, which is the point of a partial write.
    expect(f.$value()).toEqual({
      title: 'Arquitectura de Fudic, revisada',
      body: stored.body,
      published: true,
      seo: {
        description: 'Descripción',
        canonical: 'https://fudie.eu/blog/arquitectura',
      },
      tags: ['web', 'compilador'],
    });
  });

  it('runs the server-only rule on the server, and the 422 comes back by path', async () => {
    // ── the client ────────────────────────────────────────────────────────
    const client = blogForm();
    client.$set({ ...stored, title: 'Ocupado' });

    // The client says yes: the rule that knows about taken slugs is not here.
    expect(await client.$validate()).toBe(true);
    const sent = client.$value();

    // ── the server, on the same schema, one instance per request ──────────
    const server = blogForm();
    server.$set(sent);

    expect(await server.$validate({ server: true })).toBe(false);
    expect(server.$errors()).toEqual({ title: { taken: true } });

    // ── the 422 lands back on the client's fields ─────────────────────────
    const response = server.$errors();
    expect(response).not.toBeNull();
    client.$setErrors(response);

    expect(client.title.errors()).toEqual({ taken: true });
    // Errors that come from outside are shown, so the field counts as touched.
    expect(client.title.touched()).toBe(true);
    expect(client.body.touched()).toBe(false);

    // The user renames it and the client is clean again.
    client.title.set('Arquitectura de Fudic');
    expect(await client.$validate()).toBe(true);
    expect(client.$errors()).toBeNull();
  });

  it('starts over on the DEFINITION, not on what was loaded', async () => {
    const f = blogForm();
    f.$set(stored);
    f.title.set('');
    f.$touch();
    await f.$validate();

    expect(f.$errors()).not.toBeNull();
    expect(f.seo.canonical.touched()).toBe(true);
    // Editing after a load IS dirty: that is what the reference is for.
    expect(f.title.dirty()).toBe(true);

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
    expect(f.seo.canonical.touched()).toBe(false);
    expect(f.title.dirty()).toBe(false);
  });
});

describe('a strictly typed order line, where the width does the refusing', () => {
  /** What a point of sale would post, with three fields wrong in three ways. */
  const bad = {
    itemId: 918_233,
    qty: 2.5, // not an integer
    priceCts: 1_450,
    tax: { pct: 300, included: true }, // a percentage that does not fit a byte
    discount: 0,
    takeaway: true,
    invited: false,
    printed: false,
    table: 70_000, // above u16
    at: new Date('nope') as Date | null, // an invalid instant
    note: 'sin gluten',
    tags: ['celiaco'] as readonly string[],
  };

  it('refuses by declared width, names every offender, and truncates nothing', async () => {
    const line = form(orderLine);
    line.$set(bad);

    expect(await line.$validate()).toBe(false);
    // The one inside the group is named by its path, like any other field.
    expect(line.$errors()).toEqual({
      qty: { range: 'u16' },
      'tax.pct': { range: 'u8' },
      table: { range: 'u16' },
      at: { range: 'date' },
    });

    // The values are still exactly what was written: a width refuses, it never
    // narrows behind the author's back.
    expect(line.qty()).toBe(2.5);
    expect(line.tax.pct()).toBe(300);
    expect(line.table()).toBe(70_000);
  });

  it('lets the business rule speak only once the value fits', async () => {
    const line = form(orderLine);
    line.$patch({ qty: 0.5 });

    await line.$validate();
    expect(line.qty.errors()).toEqual({ range: 'u16' });

    // An integer now: the width is happy and `min(1)` gets its turn.
    line.qty.set(0);
    await line.$validate();
    expect(line.qty.errors()).toEqual({ min: 1 });

    line.qty.set(3);
    expect(await line.$validate()).toBe(true);
  });

  it('judges a list element by element, and says which one', async () => {
    const line = form(orderLine);
    line.$patch({ tags: ['ok', 7 as unknown as string] });

    await line.$validate();
    expect(line.tags.errors()).toEqual({ range: 'arr', at: 1, of: 'str' });
  });

  it('hands back a value ready to send, with the API shape and the widths intact', async () => {
    const line = form(orderLine);
    const at = new Date('2026-08-16T12:00:00.000Z');
    const good = { ...bad, qty: 3, tax: { pct: 21, included: true }, table: 7, at };
    line.$set(good);

    expect(await line.$validate()).toBe(true);
    // The nested object of the API travels as a nested object: a group keeps the
    // shape of what is sent instead of flattening it into the form.
    expect(line.$value()).toEqual({
      itemId: 918_233,
      qty: 3,
      priceCts: 1_450,
      tax: { pct: 21, included: true },
      discount: 0,
      takeaway: true,
      invited: false,
      printed: false,
      table: 7,
      at,
      note: 'sin gluten',
      tags: ['celiaco'],
    });
    // What came in is what goes out, key for key.
    expect(line.$value()).toEqual(good);

    // The schema still declares the widths a transport would read off it, inside
    // the group as well as outside.
    expect(line.qty.type).toBe('u16');
    expect(line.at.type).toBe('date');
    expect(line.tags.of).toBe('str');
    expect(line.tax.pct.type).toBe('u8');
    expect(line.tax.included.type).toBe('bool');
  });

  it('a group is a form: it validates, reads and resets on its own', async () => {
    const line = form(orderLine);
    line.$set({ ...bad, qty: 3, table: 7, at: null, tax: { pct: 300, included: false } });

    expect(await line.tax.$validate()).toBe(false);
    expect(line.tax.$errors()).toEqual({ pct: { range: 'u8' } });
    expect(line.tax.$value()).toEqual({ pct: 300, included: false });

    line.tax.$reset();
    // Back to the DEFINITION, not to what was loaded.
    expect(line.tax.$value()).toEqual({ pct: 21, included: true });
    expect(line.tax.$errors()).toBeNull();
  });
});
