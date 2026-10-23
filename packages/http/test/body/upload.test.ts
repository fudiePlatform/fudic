/**
 * SDD-56 §4.17–§4.19 and criteria 41–46 and 51–52: the body of an upload, end to end.
 *
 * The stub encodes, the wire is inspected, the dispatcher decodes, and the handler says what it
 * got. What changes between the cases is how many bytes travel; what the handler receives never
 * does. A function of a `.fudapi` since SDD-60: with a `form` its upload is the form's, without
 * one its arguments travel as JSON with their keys.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { arr, bool, control, date, form, group, str, u16, u32, u8 } from '@fudic/forms/contract';
import type { AnyForm } from '@fudic/forms';
import { middleware, use, type Level } from '../../src/contract/index.js';
import { browser, call, raw, serve } from './harness.js';

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

const formOf = (schema: object): AnyForm => form(schema as never) as unknown as AnyForm;

const filled = (schema: object, value: object): AnyForm => {
  const f = formOf(schema);
  f.$set(value as never);
  return f;
};

describe('criterion 41: positional', () => {
  it('a form to a function with a form: application/fud, the array, and not one key', async () => {
    const wire = serve(() => undefined, { form: formOf(blogSchema) });
    await call({ form: formOf(blogSchema) })(filled(blogSchema, post) as never);

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

  it('arguments to a function without a form: application/json with their keys', async () => {
    const wire = serve((ctx) => ctx.args, { args: { title: 'str', published: 'bool' } });
    expect(await call({ args: { title: 'str', published: 'bool' } })({ title: post.title, published: true } as never)).toEqual({
      title: post.title,
      published: true,
    });
    expect(wire[0]!.headers.get('content-type')).toBe('application/json');
    expect(JSON.parse(wire[0]!.text)).toEqual({ title: post.title, published: true });
  });

  it('plain arguments to a function with a form stay JSON with keys', async () => {
    const wire = serve((ctx) => ctx.form.title(), { form: formOf(blogSchema) });
    expect(await call({ form: formOf(blogSchema) })(post as never)).toBe(post.title);
    expect(wire[0]!.headers.get('content-type')).toBe('application/json');
  });
});

describe('criterion 42: round trip, three ways', () => {
  async function through(schema: object, value: object) {
    let got: unknown;
    const wire = serve(
      (ctx) => {
        got = ctx.form.$value();
      },
      { form: formOf(schema) },
    );
    const sent = filled(schema, value);
    await call({ form: formOf(schema) })(sent as never);
    return { got, sent: sent.$value(), type: wire[0]!.headers.get('content-type') };
  }

  it('with keys (something that is not the stub sends the value as JSON)', async () => {
    let got: unknown;
    const res = await raw(
      (ctx) => {
        got = ctx.form.$value();
      },
      { form: formOf(typedSchema) },
      JSON.stringify(typedValue),
      { 'content-type': 'application/json' },
    );
    expect(res.status).toBe(204);
    // The date left as a string and came back a Date, revived against the schema of the form.
    expect(got).toEqual(typedValue);
    expect((got as { at: Date }).at).toBeInstanceOf(Date);
  });

  it('positional', async () => {
    const r = await through(blogSchema, post);
    expect(r.type).toBe('application/fud');
    expect(r.got).toEqual(r.sent);
  });

  it('binary', async () => {
    const r = await through(typedSchema, typedValue);
    expect(r.type).toBe('application/fud+bin');
    expect(r.got).toEqual(r.sent);
    expect((r.got as { at: Date }).at).toBeInstanceOf(Date);
  });
});

describe('criterion 43: arity and undefined', () => {
  it('a positional array one position short is 400, and the handler never runs', async () => {
    const handle = vi.fn();
    const res = await raw(handle, { form: formOf(blogSchema) }, JSON.stringify(['t', 'b', true, ['d', 'c']]), {
      'content-type': 'application/fud',
    });
    expect(res.status).toBe(400);
    expect(handle).not.toHaveBeenCalled();
  });

  it('a group that is not an array is 400 too', async () => {
    const res = await raw(() => 1, { form: formOf(blogSchema) }, JSON.stringify(['t', 'b', true, 'nope', []]), {
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
    const wire = serve(
      (ctx) => {
        got = ctx.form.$value();
      },
      { form: formOf(schema) },
    );
    await call({ form: formOf(schema) })(f as never);
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
    const schema = { x: control<unknown>(null) };
    const f = form(schema);
    f.$set({ x: loop } as never);
    await expect(call({ form: formOf(schema) })(f as never)).rejects.toThrow(TypeError);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('criterion 46: the binary degrades to application/fud, and the call ends the same', () => {
  async function degrade(schema: object, value: object) {
    let got: unknown;
    const wire = serve(
      (ctx) => {
        got = ctx.form.$value();
      },
      { form: formOf(schema) },
    );
    const sent = filled(schema, value);
    await call({ form: formOf(schema) })(sent as never);
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
  const withForm = { form: formOf(blogSchema) };

  it('content-encoding: br is 415', async () => {
    const res = await raw(() => 1, withForm, '[]', { 'content-type': 'application/json', 'content-encoding': 'br' });
    expect(res.status).toBe(415);
    expect((await res.json()).detail).toContain('br');
  });

  it('application/fud to a function without a form is 400', async () => {
    const res = await raw(() => 1, {}, '["a"]', { 'content-type': 'application/fud' });
    expect(res.status).toBe(400);
  });

  it('application/fud+bin to a function without a form is 400', async () => {
    const res = await raw(() => 1, {}, new Uint8Array([0]), { 'content-type': 'application/fud+bin' });
    expect(res.status).toBe(400);
  });

  it('a content-type that is none of the three is 415; none at all, too', async () => {
    expect((await raw(() => 1, withForm, 'x', { 'content-type': 'text/plain' })).status).toBe(415);
    const bare = await raw(() => 1, withForm, new Uint8Array([1]), {});
    expect(bare.status).toBe(415);
  });

  it('a content-type with parameters is read by its type', async () => {
    const res = await raw((ctx) => ctx.args, {}, '{"a":1}', { 'content-type': 'application/json; charset=utf-8' });
    expect(await res.json()).toEqual({ a: 1 });
  });

  it('broken JSON as application/fud is 400', async () => {
    expect((await raw(() => 1, withForm, '[nope', { 'content-type': 'application/fud' })).status).toBe(400);
  });

  it('a binary body that is not its schema is 400', async () => {
    const typed = { form: formOf({ a: u32() }) };
    expect((await raw(() => 1, typed, new Uint8Array([0, 1]), { 'content-type': 'application/fud+bin' })).status).toBe(400);
    expect((await raw(() => 1, typed, new Uint8Array([0, 1, 2, 3, 4, 5]), { 'content-type': 'application/fud+bin' })).status).toBe(400);
  });

  it('a body that does not decompress is 400', async () => {
    const res = await raw(() => 1, withForm, new Uint8Array([1, 2, 3, 4]), {
      'content-type': 'application/json',
      'content-encoding': 'gzip',
    });
    expect(res.status).toBe(400);
  });

  it('an empty body is undefined args, whatever its content-type', async () => {
    const res = await raw((ctx) => ctx.args === undefined, {}, '', { 'content-type': 'text/plain' });
    expect(await res.json()).toBe(true);
  });
});

describe('criterion 52: the middlewares never see the body', () => {
  /** A level that uses a middleware with one half, `half`. */
  const peeking = (side: 'client' | 'server', half: (ctx: { args: unknown }, next: (c: never) => Promise<unknown>) => unknown): Level => {
    const piece = middleware({ id: 'middlewares/peek', name: 'peek', [side]: true });
    piece[side](half as never);
    return { steps: [{ use: [use(piece)] }] };
  };

  it('a client middleware reads ctx.args as the form, positional, binary or compressed', async () => {
    const seen: unknown[] = [];
    const peek = peeking('client', (ctx, next) => {
      seen.push(ctx.args);
      return next(ctx as never);
    });
    const big = { ...post, body: post.body.repeat(40) };
    for (const [schema, value, chain] of [
      [blogSchema, post, [peek]],
      [typedSchema, typedValue, [peek]],
      [blogSchema, big, [{ ...peek, compress: { format: 'gzip' } }]],
    ] as const) {
      serve(() => undefined, { form: formOf(schema) });
      const f = filled(schema, value);
      await call({ form: formOf(schema), chain: [...chain] as Level[] })(f as never);
      expect(seen.at(-1)).toBe(f);
    }
    expect(seen.every((a) => !(a instanceof Uint8Array) && typeof a !== 'string')).toBe(true);
  });

  it('a server middleware reads ctx.args as the decoded value, never bytes', async () => {
    let seen: unknown;
    const peek = peeking('server', (ctx, next) => {
      seen = ctx.args;
      return next(ctx as never);
    });
    serve(() => undefined, { form: formOf(typedSchema), chain: [peek] });
    await call({ form: formOf(typedSchema) })(filled(typedSchema, typedValue) as never);
    expect(Array.isArray(seen)).toBe(true);
  });
});
