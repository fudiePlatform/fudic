/**
 * SDD-56 §4.17–§4.19 and criteria 41–46 and 51–52: the body of an upload, end to end — in
 * `fud-bin`, or with its keys under `use json` (SDD-67 §3.2, criteria 12 and 9).
 *
 * The stub encodes, the wire is inspected, the dispatcher decodes, and the handler says what it
 * got. What changes between the cases is how many bytes travel; what the handler receives never
 * does.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { arr, bool, date, form, group, str, u16, u32, u8 } from '@fudic/forms/contract';
import type { AnyForm } from '@fudic/forms';
import { middleware, use, type Level } from '../../src/contract/index.js';
import { HttpError } from '../../src/errors.js';
import { binWire } from '../../src/wire/bin.js';
import { jsonWire } from '../../src/wire/json.js';
import { formTypes } from '../../src/wire/schema.js';
import type { Ty } from '../../src/wire/ty.js';
import { binProblem } from '../helpers.js';
import { browser, call, raw, serve, type Over } from './harness.js';

beforeEach(browser);
afterEach(() => vi.unstubAllGlobals());

/** The blog form of docs/forms. */
const blogSchema = {
  title: str(''),
  body: str(''),
  published: bool(false),
  seo: group({ description: str(''), canonical: str('') }),
  tags: arr(str, []),
};
const post = {
  title: 'Arquitectura de Fudic',
  body: 'Cuerpo del post con algo de texto para que pese.',
  published: true,
  seo: { description: 'Descripción SEO del post', canonical: 'https://fudie.eu/blog/x' },
  tags: ['web', 'compilador'] as readonly string[],
};

/** A form with every kind of node. */
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

/** A function that takes the form of `schema`, as the emitter writes it. */
const withForm = (schema: object, over: Over = {}): Over => {
  const f = formOf(schema);
  return { form: f, args: formTypes(f.$schema), ...over };
};

describe('criterion 41: a form travels as the level of its controls', () => {
  it('a form: application/fud+bin, its bytes, and not one key', async () => {
    const wire = serve(() => undefined, withForm(blogSchema));
    await call(withForm(blogSchema))(filled(blogSchema, post) as never);

    expect(wire[0]!.headers.get('content-type')).toBe('application/fud+bin');
    expect(wire[0]!.headers.get('content-encoding')).toBeNull();
    expect([...wire[0]!.bytes]).toEqual([...(binWire.encodeArgs(formTypes(formOf(blogSchema).$schema), post) as Uint8Array)]);
    for (const key of ['title', 'body', 'published', 'seo', 'description', 'canonical', 'tags']) {
      expect(wire[0]!.text).not.toContain(key);
    }
  });

  it('arguments without a form: application/fud+bin too', async () => {
    const T: Ty = { fields: () => ({ title: 'str', published: 'bool' }) };
    const wire = serve((ctx) => ctx.args, { args: { title: 'str', published: 'bool' }, returns: T });
    expect(await call({ args: { title: 'str', published: 'bool' }, returns: T })({ title: post.title, published: true } as never)).toEqual({
      title: post.title,
      published: true,
    });
    expect(wire[0]!.headers.get('content-type')).toBe('application/fud+bin');
    expect([...wire[0]!.bytes]).toEqual([0b1, post.title.length, ...new TextEncoder().encode(post.title)]);
  });

  it('a plain value in place of the form travels the same', async () => {
    const wire = serve((ctx) => ctx.form.title(), withForm(blogSchema, { returns: 'str' }));
    expect(await call(withForm(blogSchema, { returns: 'str' }))(post as never)).toBe(post.title);
    expect(wire[0]!.headers.get('content-type')).toBe('application/fud+bin');
  });
});

describe('criterion 12: with use json, a form travels with its keys; no request is application/fud', () => {
  it('a form to a function with use json: application/json, its keys', async () => {
    const wire = serve(() => undefined, withForm(blogSchema, { wire: jsonWire }));
    await call(withForm(blogSchema, { wire: jsonWire }))(filled(blogSchema, post) as never);
    expect(wire[0]!.headers.get('content-type')).toBe('application/json');
    expect(JSON.parse(wire[0]!.text)).toEqual(post);
  });

  it('none of the requests above or below is application/fud', async () => {
    const types: string[] = [];
    for (const over of [withForm(blogSchema), withForm(blogSchema, { wire: jsonWire })]) {
      const wire = serve(() => undefined, over);
      await call(over)(filled(blogSchema, post) as never);
      types.push(wire[0]!.headers.get('content-type')!);
    }
    expect(types).toEqual(['application/fud+bin', 'application/json']);
  });
});

describe('criterion 42: round trip, both formats', () => {
  async function through(schema: object, value: object, over: Over = {}) {
    let got: unknown;
    const wire = serve(
      (ctx) => {
        got = ctx.form.$value();
      },
      withForm(schema, over),
    );
    const sent = filled(schema, value);
    await call(withForm(schema, over))(sent as never);
    return { got, sent: sent.$value(), type: wire[0]!.headers.get('content-type') };
  }

  it('fud-bin', async () => {
    const r = await through(typedSchema, typedValue);
    expect(r.type).toBe('application/fud+bin');
    expect(r.got).toEqual(r.sent);
    expect((r.got as { at: Date }).at).toBeInstanceOf(Date);
  });

  it('use json: the date left as a string and came back a Date', async () => {
    const r = await through(typedSchema, typedValue, { wire: jsonWire });
    expect(r.type).toBe('application/json');
    expect(r.got).toEqual(r.sent);
    expect((r.got as { at: Date }).at).toBeInstanceOf(Date);
  });

  it('empty controls travel as null and come back as null', async () => {
    const r = await through(typedSchema, { ...typedValue, id: null, at: null, tags: null });
    expect(r.got).toEqual(r.sent);
    expect(r.got).toMatchObject({ id: null, at: null, tags: null });
  });

  it('something that is not the stub sends the value as JSON, to a function with use json', async () => {
    let got: unknown;
    const res = await raw(
      (ctx) => {
        got = ctx.form.$value();
      },
      withForm(typedSchema, { wire: jsonWire }),
      JSON.stringify(typedValue),
      { 'content-type': 'application/json' },
    );
    expect(res.status).toBe(204);
    expect(got).toEqual(typedValue);
  });
});

describe('criterion 43: a body short of its form', () => {
  it('a body one control short is 400, and the handler never runs', async () => {
    const handle = vi.fn();
    const short = binWire.encodeArgs({ title: 'str', body: 'str' }, { title: 't', body: 'b' }) as Uint8Array;
    const res = await raw(handle, withForm(blogSchema), short as BodyInit, { 'content-type': binWire.type });
    expect(res.status).toBe(400);
    expect((await binProblem(res)).detail).toMatch(/^binary body: /u);
    expect(handle).not.toHaveBeenCalled();
  });

  it('with use json, a group that is not an object is 400', async () => {
    const res = await raw(() => 1, withForm(blogSchema, { wire: jsonWire }), JSON.stringify({ ...post, seo: 'nope' }), {
      'content-type': 'application/json',
    });
    expect(res.status).toBe(400);
  });
});

/**
 * SDD-67 §3.1: what does not fit is refused, not sent in another format — and never written as
 * bytes that read back as something else. The writing side refuses it as it refuses a u8 of 300:
 * a 400, before any request.
 */
describe('§3.1: a form value that does not fit is refused before the network', () => {
  async function refused(schema: object, value: object, over: Over = {}) {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const e = await call(withForm(schema, over))(filled(schema, value) as never).catch((x: unknown) => x);
    expect(fetch).not.toHaveBeenCalled();
    expect(e).toBeInstanceOf(HttpError);
    expect((e as HttpError).status).toBe(400);
  }

  it('an arr with a null inside', async () => {
    await refused({ list: arr(u8, []) }, { list: [1, null, 3] });
  });

  it('a str in null', async () => {
    await refused({ s: str('') }, { s: null });
  });

  it('criterion 4: a date outside 48 bits, in both formats', async () => {
    const far = new Date(8.64e15);
    await refused({ when: date() }, { when: far });
    await refused({ when: date() }, { when: far }, { wire: jsonWire });
  });
});

describe('criterion 51 and §4.19: what the server refuses', () => {
  it('content-encoding: br is 415', async () => {
    const res = await raw(() => 1, withForm(blogSchema), new Uint8Array([0]), { 'content-type': binWire.type, 'content-encoding': 'br' });
    expect(res.status).toBe(415);
    expect((await binProblem(res)).detail).toContain('br');
  });

  it('criterion 12: application/fud is 415', async () => {
    const res = await raw(() => 1, withForm(blogSchema), '["a"]', { 'content-type': 'application/fud' });
    expect(res.status).toBe(415);
  });

  it('a body to a function that takes nothing is longer than its schema: 400', async () => {
    const res = await raw(() => 1, {}, new Uint8Array([0]), { 'content-type': binWire.type });
    expect(res.status).toBe(400);
  });

  it('a content-type that is not the function’s is 415; none at all, too', async () => {
    expect((await raw(() => 1, withForm(blogSchema), 'x', { 'content-type': 'text/plain' })).status).toBe(415);
    expect((await raw(() => 1, withForm(blogSchema), new Uint8Array([1]), {})).status).toBe(415);
  });

  it('a content-type with parameters is read by its type', async () => {
    const T: Ty = { fields: () => ({ a: 'u8' }) };
    const body = binWire.encodeArgs({ a: 'u8' }, { a: 1 }) as Uint8Array;
    const res = await raw((ctx) => ctx.args, { args: { a: 'u8' }, returns: T }, body as BodyInit, { 'content-type': `${binWire.type}; v=1` });
    expect(binWire.decodeValue(T, new Uint8Array(await res.arrayBuffer()))).toEqual({ a: 1 });
  });

  it('a binary body that is not its form is 400', async () => {
    const typed = withForm({ a: u32() });
    expect((await raw(() => 1, typed, new Uint8Array([0, 1]), { 'content-type': binWire.type })).status).toBe(400);
    expect((await raw(() => 1, typed, new Uint8Array([0, 1, 2, 3, 4, 5]), { 'content-type': binWire.type })).status).toBe(400);
  });

  it('a body that does not decompress is 400', async () => {
    const res = await raw(() => 1, withForm(blogSchema), new Uint8Array([1, 2, 3, 4]), {
      'content-type': binWire.type,
      'content-encoding': 'gzip',
    });
    expect(res.status).toBe(400);
  });

  it('an empty body is no arguments, whatever its content-type', async () => {
    const res = await raw((ctx) => ctx.args === undefined, { returns: 'bool' }, '', { 'content-type': 'text/plain' });
    expect(binWire.decodeValue('bool', new Uint8Array(await res.arrayBuffer()))).toBe(true);
  });
});

describe('criterion 52: the middlewares never see the body', () => {
  /** A level that uses a middleware with one half, `half`. */
  const peeking = (side: 'client' | 'server', half: (ctx: { args: unknown }, next: (c: never) => Promise<unknown>) => unknown): Level => {
    const piece = middleware({ id: 'middlewares/peek', name: 'peek', [side]: true });
    piece[side](half as never);
    return { steps: [{ use: [use(piece)] }] };
  };

  it('a client middleware reads ctx.args as the form, in either format or compressed', async () => {
    const seen: unknown[] = [];
    const peek = peeking('client', (ctx, next) => {
      seen.push(ctx.args);
      return next(ctx as never);
    });
    const big = { ...post, body: post.body.repeat(40) };
    for (const [schema, value, chain, over] of [
      [blogSchema, post, [peek], {}],
      [typedSchema, typedValue, [peek], { wire: jsonWire }],
      [blogSchema, big, [{ ...peek, compress: { format: 'gzip' } }], {}],
    ] as const) {
      serve(() => undefined, withForm(schema, over));
      const f = filled(schema, value);
      await call(withForm(schema, { ...over, chain: [...chain] as Level[] }))(f as never);
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
    serve(() => undefined, withForm(typedSchema, { chain: [peek] }));
    await call(withForm(typedSchema))(filled(typedSchema, typedValue) as never);
    expect(seen).toEqual(typedValue);
  });
});
