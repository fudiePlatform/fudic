/**
 * SDD-56 §4.17–§4.19 and criteria 41–46 and 51–52: the body of an upload, end to end.
 *
 * The stub encodes, the wire is inspected, `dispatch` decodes, and `handle` says what it got.
 * What changes between the cases is how many bytes travel; what `handle` receives never does.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { arr, bool, control, date, form, group, str, u16, u32, u8 } from '@fudic/forms';
import type { AnyForm } from '@fudic/forms';
import { $fn } from '../../src/client/fn.js';
import { FORM_STAGES, KEYED_STAGES } from '../../src/client/stages/index.js';
import { put } from '../../src/builder.js';
import { chain } from '../../src/chain.js';
import { middleware } from '../../src/middleware.js';
import { browser, raw, serve } from './harness.js';

beforeEach(browser);
afterEach(() => vi.unstubAllGlobals());

/** The blog form of docs/forms, untyped: it travels positional, never binary. */
const blogSchema = {
  title: control(''),
  body: control(''),
  published: control(false),
  seo: group({ description: control(''), canonical: control('') }),
  tags: control<readonly string[]>([]),
};
const post = {
  title: 'Arquitectura de Fudic',
  body: 'Cuerpo del post con algo de texto para que pese.',
  published: true,
  seo: { description: 'Descripción SEO del post', canonical: 'https://fudie.eu/blog/x' },
  tags: ['web', 'compilador'] as readonly string[],
};

/** A typed form with every kind of node: it travels binary. */
const typedSchema = {
  id: u32(0),
  qty: u16(1),
  pct: u8(21),
  paid: bool(false),
  at: date(),
  note: str(''),
  tags: arr(str, []),
  tax: group({ pct: u8(0), included: bool(true) }),
};
const typedValue = {
  id: 918_233,
  qty: 3,
  pct: 21,
  paid: true,
  at: new Date('1969-07-20T20:17:00Z'),
  note: 'sin gluten 😀',
  tags: ['a', 'b'],
  tax: { pct: 10, included: false },
};

const call = (stages = FORM_STAGES, chainLevels: Parameters<typeof $fn>[0]['chain'] = []) =>
  $fn<AnyForm | unknown, unknown>({ name: 'save', method: 'PUT', url: '/_fudic/fn/c/x/save', chain: chainLevels, stages });

const filled = <S extends Record<string, never>>(schema: object, value: object): AnyForm => {
  const f = form(schema as S);
  f.$set(value as never);
  return f as unknown as AnyForm;
};

describe('criterion 41: positional', () => {
  it('a form to a function with .form: application/fud, the array, and not one key', async () => {
    const userForm = form(blogSchema);
    const wire = serve(put().form(userForm).handle(() => undefined));
    await call()(filled(blogSchema, post));

    expect(wire[0]!.headers.get('content-type')).toBe('application/fud');
    expect(wire[0]!.headers.get('content-encoding')).toBeNull();
    expect(JSON.parse(wire[0]!.text)).toEqual([
      post.title,
      post.body,
      true,
      [post.seo.description, post.seo.canonical],
      ['web', 'compilador'],
    ]);
    for (const key of ['title', 'body', 'published', 'seo', 'description', 'canonical', 'tags']) {
      expect(wire[0]!.text).not.toContain(`"${key}"`);
    }
  });

  it('the same form to a function without .form: application/json with its keys', async () => {
    const wire = serve(put().handle(() => undefined));
    await call(KEYED_STAGES)(filled(blogSchema, post));
    expect(wire[0]!.headers.get('content-type')).toBe('application/json');
    expect(JSON.parse(wire[0]!.text)).toEqual(post);
  });

  it('plain arguments to a function with .form stay JSON with keys', async () => {
    const userForm = form(blogSchema);
    const wire = serve(put().form(userForm).handle((ctx) => ctx.form.title()));
    expect(await call()(post)).toBe(post.title);
    expect(wire[0]!.headers.get('content-type')).toBe('application/json');
  });
});

describe('criterion 42: round trip, three ways', () => {
  async function through(stages: typeof FORM_STAGES, schema: object, value: object) {
    let got: unknown;
    const target = form(schema as never) as unknown as AnyForm;
    const wire = serve(
      put()
        .form(target)
        .handle((ctx) => {
          got = ctx.form.$value();
        }),
    );
    const sent = filled(schema, value);
    await call(stages)(sent);
    return { got, sent: sent.$value(), type: wire[0]!.headers.get('content-type') };
  }

  it('with keys (no .form on the client side of the pipeline)', async () => {
    const r = await through(KEYED_STAGES, typedSchema, typedValue);
    expect(r.type).toBe('application/json');
    // The date left as a string and came back a Date, revived against the schema of `.form`.
    expect(r.got).toEqual(r.sent);
    expect((r.got as { at: Date }).at).toBeInstanceOf(Date);
  });

  it('positional', async () => {
    const r = await through(FORM_STAGES, blogSchema, post);
    expect(r.type).toBe('application/fud');
    expect(r.got).toEqual(r.sent);
  });

  it('binary', async () => {
    const r = await through(FORM_STAGES, typedSchema, typedValue);
    expect(r.type).toBe('application/fud+bin');
    expect(r.got).toEqual(r.sent);
    expect((r.got as { at: Date }).at).toBeInstanceOf(Date);
  });
});

describe('criterion 43: arity and undefined', () => {
  it('a positional array one position short is 400, and handle never runs', async () => {
    const handle = vi.fn();
    const res = await raw(put().form(form(blogSchema)).handle(handle), JSON.stringify(['t', 'b', true, ['d', 'c']]), {
      'content-type': 'application/fud',
    });
    expect(res.status).toBe(400);
    expect(handle).not.toHaveBeenCalled();
  });

  it('a group that is not an array is 400 too', async () => {
    const res = await raw(put().form(form(blogSchema)).handle(() => 1), JSON.stringify(['t', 'b', true, 'nope', []]), {
      'content-type': 'application/fud',
    });
    expect(res.status).toBe(400);
  });

  it('a control in undefined travels as null at any depth, and the user value is not mutated', async () => {
    const schema = { meta: control<unknown>(null), plain: control<unknown>(null) };
    const mine = { deep: { gone: undefined as unknown, list: [undefined, 1] } };
    const f = form(schema);
    f.$set({ meta: mine, plain: undefined } as never);
    let got: unknown;
    const wire = serve(put().form(form(schema)).handle((ctx) => { got = ctx.form.$value(); }));
    await call()(f);
    expect(JSON.parse(wire[0]!.text)).toEqual([{ deep: { gone: null, list: [null, 1] } }, null]);
    expect(got).toEqual({ meta: { deep: { gone: null, list: [null, 1] } }, plain: null });
    expect(mine.deep.gone).toBeUndefined();
    expect('gone' in mine.deep).toBe(true);
    expect(mine.deep.list[0]).toBeUndefined();
  });

  it('a circular reference throws TypeError before the network', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const loop: Record<string, unknown> = {};
    loop['me'] = loop;
    const f = form({ x: control<unknown>(null) });
    f.$set({ x: loop } as never);
    await expect(call()(f)).rejects.toThrow(TypeError);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('criterion 46: the binary degrades to application/fud, and the call ends the same', () => {
  async function degrade(schema: object, value: object) {
    let got: unknown;
    const wire = serve(put().form(form(schema as never) as unknown as AnyForm).handle((ctx) => { got = ctx.form.$value(); }));
    const sent = filled(schema, value);
    await call()(sent);
    return { type: wire[0]!.headers.get('content-type'), got, sent: sent.$value() };
  }

  it('a control without a type', async () => {
    const r = await degrade({ n: u8(1), free: control('') }, { n: 1, free: 'x' });
    expect(r.type).toBe('application/fud');
    expect(r.got).toEqual(r.sent);
  });

  it('an arr with a null inside', async () => {
    const r = await degrade({ list: arr(u8, []) }, { list: [1, null, 3] });
    expect(r.type).toBe('application/fud');
    expect(r.got).toEqual(r.sent);
  });

  it('a date outside 48 bits comes back a Date', async () => {
    const far = new Date(8.64e15);
    const r = await degrade({ when: date(), days: arr(date, []) }, { when: far, days: [far] });
    expect(r.type).toBe('application/fud');
    expect(r.got).toEqual({ when: far, days: [far] });
  });

  it('a str in null', async () => {
    const r = await degrade({ s: str('') }, { s: null });
    expect(r.type).toBe('application/fud');
    expect(r.got).toEqual({ s: null });
  });
});

describe('criterion 51 and §4.19: what the server refuses', () => {
  const withForm = () => put().form(form(blogSchema)).handle(() => 1);

  it('content-encoding: br is 415', async () => {
    const res = await raw(withForm(), '[]', { 'content-type': 'application/json', 'content-encoding': 'br' });
    expect(res.status).toBe(415);
    expect((await res.json()).detail).toContain('br');
  });

  it('application/fud to a function without .form is 400', async () => {
    const res = await raw(put().handle(() => 1), '["a"]', { 'content-type': 'application/fud' });
    expect(res.status).toBe(400);
  });

  it('application/fud+bin to a function without .form is 400', async () => {
    const res = await raw(put().handle(() => 1), new Uint8Array([0]), { 'content-type': 'application/fud+bin' });
    expect(res.status).toBe(400);
  });

  it('a content-type that is none of the three is 415; none at all, too', async () => {
    expect((await raw(withForm(), 'x', { 'content-type': 'text/plain' })).status).toBe(415);
    const bare = await raw(withForm(), new Uint8Array([1]), {});
    expect(bare.status).toBe(415);
  });

  it('a content-type with parameters is read by its type', async () => {
    const res = await raw(put().handle((ctx) => ctx.args), '{"a":1}', { 'content-type': 'application/json; charset=utf-8' });
    expect(await res.json()).toEqual({ a: 1 });
  });

  it('broken JSON as application/fud is 400', async () => {
    expect((await raw(withForm(), '[nope', { 'content-type': 'application/fud' })).status).toBe(400);
  });

  it('a binary body that is not its schema is 400', async () => {
    const typed = put().form(form({ a: u32() })).handle(() => 1);
    expect((await raw(typed, new Uint8Array([0, 1]), { 'content-type': 'application/fud+bin' })).status).toBe(400);
    expect((await raw(typed, new Uint8Array([0, 1, 2, 3, 4, 5]), { 'content-type': 'application/fud+bin' })).status).toBe(400);
  });

  it('a body that does not decompress is 400', async () => {
    const res = await raw(withForm(), new Uint8Array([1, 2, 3, 4]), {
      'content-type': 'application/json',
      'content-encoding': 'gzip',
    });
    expect(res.status).toBe(400);
  });

  it('an empty body is undefined args, whatever its content-type', async () => {
    const res = await raw(put().handle((ctx) => ctx.args === undefined), '', { 'content-type': 'text/plain' });
    expect(await res.json()).toBe(true);
  });
});

describe('criterion 52: the middlewares never see the body', () => {
  it('a client middleware reads ctx.args as the form, positional, binary or compressed', async () => {
    const seen: unknown[] = [];
    const peek = middleware().client((ctx, next) => {
      seen.push(ctx.args);
      return next(ctx);
    });
    const big = { ...post, body: post.body.repeat(40) };
    for (const [schema, value, levels] of [
      [blogSchema, post, [chain().use(peek)]],
      [typedSchema, typedValue, [chain().use(peek)]],
      [blogSchema, big, [chain().use(peek).compress({ format: 'gzip' })]],
    ] as const) {
      serve(put().form(form(schema as never) as unknown as AnyForm).handle(() => undefined));
      const f = filled(schema, value);
      await call(FORM_STAGES, [...levels])(f);
      expect(seen.at(-1)).toBe(f);
    }
    expect(seen.every((a) => !(a instanceof Uint8Array) && typeof a !== 'string')).toBe(true);
  });

  it('a server middleware reads ctx.args as the decoded value, never bytes', async () => {
    let seen: unknown;
    const peek = middleware().server((ctx, next) => {
      seen = ctx.args;
      return next(ctx);
    });
    serve(put().use(peek).form(form(typedSchema)).handle(() => undefined));
    await call()(filled(typedSchema, typedValue));
    expect(Array.isArray(seen)).toBe(true);
  });
});
