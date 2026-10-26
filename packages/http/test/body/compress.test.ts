/**
 * SDD-56 §4.17, criteria 48–50: compression of the upload, asked for in the chain.
 *
 * With `{ format: 'deflate-raw', min: 1000 }` — the decision measured in docs/forms — a
 * typical form goes out in clear and a long one compressed, and the server reads both the
 * same. The innermost level that writes `compress` wins. And a runtime without
 * `CompressionStream` is the same branch as a body below the threshold: it goes in clear.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { arr, control, form, group, u8 } from '@fudic/forms/contract';
import type { AnyForm } from '@fudic/forms';
import { compress } from '../../src/client/stages/compress.js';
import { runPipeline, type Stage } from '../../src/client/pipeline.js';
import type { Level } from '../../src/contract/index.js';
import type { CompressOptions } from '../../src/types.js';
import { browser, call, serve } from './harness.js';

beforeEach(browser);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

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
/** The same form with its body repeated 30 times: the long case of docs/forms. */
const long = { ...post, body: post.body.repeat(30) };

const MEASURED = { format: 'deflate-raw', min: 1000 } as const;

/** A level that writes only `compress`. */
const level = (compression: CompressOptions | false): Level => ({ steps: [], compress: compression });

const blog = (): AnyForm => form(blogSchema) as unknown as AnyForm;

const make = (value: object): AnyForm => {
  const f = blog();
  f.$set(value as never);
  return f;
};

/** `save` with the blog form and `chain`: what it sends, and what the server answers. */
const save = (chain: readonly Level[]) => call({ form: blog(), chain: [...chain] });

/** Serves a function that answers with what the handler got, and returns what travelled. */
function echo(chain: readonly Level[] = []) {
  return serve((ctx) => ctx.form.$value(), { form: blog(), chain: [...chain] });
}

describe('criterion 48: the threshold', () => {
  it('the typical form goes out in clear, with no content-encoding', async () => {
    const wire = echo();
    expect(await save([level(MEASURED)])(make(post) as never)).toEqual(post);
    console.log(`typical form: ${wire[0]!.bytes.length} B positional, in clear`);
    expect(wire[0]!.bytes.length).toBeLessThan(1000);
    expect(wire[0]!.headers.get('content-encoding')).toBeNull();
  });

  it('the long form goes out compressed, and the server reads it the same', async () => {
    const plain = JSON.stringify(make(long).$positional()).length;
    const wire = echo();
    expect(await save([level(MEASURED)])(make(long) as never)).toEqual(long);
    console.log(`long form: ${plain} B positional → ${wire[0]!.bytes.length} B deflate-raw`);
    expect(plain).toBeGreaterThanOrEqual(1000);
    expect(wire[0]!.headers.get('content-encoding')).toBe('deflate-raw');
    expect(wire[0]!.headers.get('content-type')).toBe('application/fud');
    expect(wire[0]!.bytes.length).toBeLessThan(plain);
  });

  it.each(['gzip', 'deflate'] as const)('%s round trips too', async (format) => {
    const wire = echo();
    expect(await save([level({ format })])(make(long) as never)).toEqual(long);
    expect(wire[0]!.headers.get('content-encoding')).toBe(format);
  });

  it('min defaults to 1000', async () => {
    const wire = echo();
    await save([level({ format: 'gzip' })])(make(post) as never);
    expect(wire[0]!.headers.get('content-encoding')).toBeNull();
  });

  it('a body over min that does not compress goes out in clear', async () => {
    // 2 000 random bytes, in binary: over min, and no compressor makes noise smaller.
    const schema = { noise: arr(u8, []) };
    const noise = [...crypto.getRandomValues(new Uint8Array(2000))];
    const wire = serve((ctx) => ctx.form.noise().length, { form: form(schema) as unknown as AnyForm });
    const f = form(schema);
    f.$set({ noise });
    const upload = call({ form: form(schema) as unknown as AnyForm, chain: [level(MEASURED)] });
    expect(await upload(f as never)).toBe(2000);
    expect(wire[0]!.headers.get('content-type')).toBe('application/fud+bin');
    expect(wire[0]!.bytes.length).toBeGreaterThanOrEqual(1000);
    expect(wire[0]!.headers.get('content-encoding')).toBeNull();
  });

  it('a keyed body is compressed by the same rule', async () => {
    const wire = serve((ctx) => ctx.args, { args: { body: 'str' } });
    const upload = call({ args: { body: 'str' }, chain: [level(MEASURED)] });
    expect(await upload({ body: long.body } as never)).toEqual({ body: long.body });
    expect(wire[0]!.headers.get('content-type')).toBe('application/json');
    expect(wire[0]!.headers.get('content-encoding')).toBe('deflate-raw');
  });
});

describe('criterion 49: the innermost level wins', () => {
  it('global compress and a function with compress off: that one in clear, the rest compressed', async () => {
    const wire = echo();
    await save([level(MEASURED), { steps: [] }, level(false)])(make(long) as never);
    expect(wire[0]!.headers.get('content-encoding')).toBeNull();

    const wire2 = echo();
    await save([level(MEASURED), { steps: [] }, { steps: [] }])(make(long) as never);
    expect(wire2[0]!.headers.get('content-encoding')).toBe('deflate-raw');
  });

  it('only in the function: only it compresses', async () => {
    const wire = echo();
    await save([{ steps: [] }, level(MEASURED)])(make(long) as never);
    expect(wire[0]!.headers.get('content-encoding')).toBe('deflate-raw');

    const wire2 = echo();
    await save([{ steps: [] }, { steps: [] }])(make(long) as never);
    expect(wire2[0]!.headers.get('content-encoding')).toBeNull();
  });

  it('the file level overrides the global one', async () => {
    const wire = echo();
    await save([level(MEASURED), level(false)])(make(long) as never);
    expect(wire[0]!.headers.get('content-encoding')).toBeNull();
  });
});

describe('criterion 50: without CompressionStream', () => {
  it('the call goes out in clear and ends the same', async () => {
    vi.stubGlobal('CompressionStream', undefined);
    // The support of a stage is read once per process: a fresh module is a fresh process.
    vi.resetModules();
    const fresh = await import('../../src/contract/fn.js');
    const wire = echo();
    const upload = fresh.stub<never, unknown, unknown>({ id: 'components/x', name: 'save', method: 'PUT', form: blog(), chain: [level(MEASURED)] });
    expect(await upload(make(long) as never)).toEqual(long);
    expect(wire[0]!.headers.get('content-encoding')).toBeNull();
    expect(wire[0]!.headers.get('content-type')).toBe('application/fud');
  });
});

describe('the pipeline (§4.17)', () => {
  const info = { method: 'PUT', compress: false } as const;

  it('a stage that is not supported is skipped, and asked only once per process', async () => {
    const supported = vi.fn(() => false);
    const apply = vi.fn();
    const never: Stage = { name: 'never', supported, applies: () => true, apply };
    const p = { value: 'x', headers: {} };
    expect(await runPipeline([never], p, info)).toBe(p);
    expect(await runPipeline([never], p, info)).toBe(p);
    expect(supported).toHaveBeenCalledOnce();
    expect(apply).not.toHaveBeenCalled();
  });

  it('a stage that does not apply is skipped; one that does is applied, in order', async () => {
    const tag = (name: string, applies: boolean): Stage => ({
      name,
      supported: () => true,
      applies: () => applies,
      apply: (p) => ({ ...p, value: `${String(p.value)}+${name}` }),
    });
    const out = await runPipeline([tag('a', true), tag('b', false), tag('c', true)], { value: 'v', headers: {} }, info);
    expect(out.value).toBe('v+a+c');
  });

  it('compress applies only when asked and over min', () => {
    const p = { value: 'x'.repeat(20), headers: {} };
    expect(compress.applies(p, { method: 'PUT', compress: false })).toBe(false);
    expect(compress.applies(p, { method: 'PUT', compress: { format: 'gzip', min: 21 } })).toBe(false);
    expect(compress.applies(p, { method: 'PUT', compress: { format: 'gzip', min: 20 } })).toBe(true);
    expect(compress.applies({ value: new Uint8Array(20), headers: {} }, { method: 'PUT', compress: { format: 'gzip', min: 20 } })).toBe(true);
  });

  it('compress keeps the payload untouched when the result is not smaller', async () => {
    const random = crypto.getRandomValues(new Uint8Array(2000));
    const p = { value: random, headers: { 'content-type': 'application/fud+bin' } };
    expect(await compress.apply(p, { method: 'PUT', compress: { format: 'gzip' } })).toBe(p);
  });
});
