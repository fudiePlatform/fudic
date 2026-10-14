/**
 * SDD-56 §4.17, criteria 48–50: compression of the upload, asked for in the chain.
 *
 * With `{ format: 'deflate-raw', min: 1000 }` — the decision measured in docs/forms — a
 * typical form goes out in clear and a long one compressed, and the server reads both the
 * same. The innermost level that writes `.compress` wins. And a runtime without
 * `CompressionStream` is the same branch as a body below the threshold: it goes in clear.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { arr, control, form, group, u8 } from '@fudic/forms';
import type { AnyForm } from '@fudic/forms';
import { $fn } from '../../src/client/fn.js';
import { FORM_STAGES, KEYED_STAGES } from '../../src/client/stages/index.js';
import { compress } from '../../src/client/stages/compress.js';
import { runPipeline, type Stage } from '../../src/client/pipeline.js';
import { put } from '../../src/builder.js';
import { chain, levelOfChain } from '../../src/chain.js';
import { browser, serve } from './harness.js';

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

const make = (value: object): AnyForm => {
  const f = form(blogSchema);
  f.$set(value as never);
  return f as unknown as AnyForm;
};

const save = (levels: Parameters<typeof $fn>[0]['chain'], stages = FORM_STAGES) =>
  $fn<AnyForm, unknown>({ name: 'save', method: 'PUT', url: '/_fudic/fn/c/x/save', chain: levels, stages });

/** Serves a function that answers with what `handle` got, and returns what travelled. */
function echo(fn = put().form(form(blogSchema))) {
  return serve(fn.handle((ctx) => ctx.form.$value()));
}

describe('criterion 48: the threshold', () => {
  it('the typical form goes out in clear, with no content-encoding', async () => {
    const wire = echo();
    expect(await save([chain().compress(MEASURED)])(make(post))).toEqual(post);
    console.log(`typical form: ${wire[0]!.bytes.length} B positional, in clear`);
    expect(wire[0]!.bytes.length).toBeLessThan(1000);
    expect(wire[0]!.headers.get('content-encoding')).toBeNull();
  });

  it('the long form goes out compressed, and the server reads it the same', async () => {
    const plain = JSON.stringify(make(long).$positional()).length;
    const wire = echo();
    expect(await save([chain().compress(MEASURED)])(make(long))).toEqual(long);
    console.log(`long form: ${plain} B positional → ${wire[0]!.bytes.length} B deflate-raw`);
    expect(plain).toBeGreaterThanOrEqual(1000);
    expect(wire[0]!.headers.get('content-encoding')).toBe('deflate-raw');
    expect(wire[0]!.headers.get('content-type')).toBe('application/fud');
    expect(wire[0]!.bytes.length).toBeLessThan(plain);
  });

  it.each(['gzip', 'deflate'] as const)('%s round trips too', async (format) => {
    const wire = echo();
    expect(await save([chain().compress({ format })])(make(long))).toEqual(long);
    expect(wire[0]!.headers.get('content-encoding')).toBe(format);
  });

  it('min defaults to 1000', async () => {
    const wire = echo();
    await save([chain().compress({ format: 'gzip' })])(make(post));
    expect(wire[0]!.headers.get('content-encoding')).toBeNull();
  });

  it('a body over min that does not compress goes out in clear', async () => {
    // 2 000 random bytes, in binary: over min, and no compressor makes noise smaller.
    const schema = { noise: arr(u8, []) };
    const noise = [...crypto.getRandomValues(new Uint8Array(2000))];
    const wire = serve(put().form(form(schema)).handle((ctx) => ctx.form.noise().length));
    const f = form(schema);
    f.$set({ noise });
    const call = $fn<AnyForm, unknown>({ name: 'save', method: 'PUT', url: '/_fudic/fn/c/x/save', chain: [chain().compress(MEASURED)], stages: FORM_STAGES });
    expect(await call(f as unknown as AnyForm)).toBe(2000);
    expect(wire[0]!.headers.get('content-type')).toBe('application/fud+bin');
    expect(wire[0]!.bytes.length).toBeGreaterThanOrEqual(1000);
    expect(wire[0]!.headers.get('content-encoding')).toBeNull();
  });

  it('a keyed body is compressed by the same rule', async () => {
    const wire = serve(put().handle((ctx) => ctx.args));
    expect(await save([chain().compress(MEASURED)], KEYED_STAGES)(make(long))).toEqual(long);
    expect(wire[0]!.headers.get('content-type')).toBe('application/json');
    expect(wire[0]!.headers.get('content-encoding')).toBe('deflate-raw');
  });
});

describe('criterion 49: the innermost level wins', () => {
  it('global compress and a function with .compress(false): that one in clear, the rest compressed', async () => {
    const global = chain().compress(MEASURED);
    const off = put().form(form(blogSchema)).compress(false).handle(() => undefined);
    const wire = serve(off);
    await save([global, off.level])(make(long));
    expect(wire[0]!.headers.get('content-encoding')).toBeNull();

    const on = put().form(form(blogSchema)).handle(() => undefined);
    const wire2 = serve(on);
    await save([global, on.level])(make(long));
    expect(wire2[0]!.headers.get('content-encoding')).toBe('deflate-raw');
  });

  it('only in the function: only it compresses', async () => {
    const global = chain();
    const own = put().form(form(blogSchema)).compress(MEASURED).handle(() => undefined);
    const wire = serve(own);
    await save([global, own.level])(make(long));
    expect(wire[0]!.headers.get('content-encoding')).toBe('deflate-raw');

    const plain = put().form(form(blogSchema)).handle(() => undefined);
    const wire2 = serve(plain);
    await save([global, plain.level])(make(long));
    expect(wire2[0]!.headers.get('content-encoding')).toBeNull();
  });

  it('the file level overrides the global one', async () => {
    const wire = echo();
    await save([chain().compress(MEASURED), levelOfChain(chain().compress(false))])(make(long));
    expect(wire[0]!.headers.get('content-encoding')).toBeNull();
  });
});

describe('criterion 50: without CompressionStream', () => {
  it('the call goes out in clear and ends the same', async () => {
    vi.stubGlobal('CompressionStream', undefined);
    // The support of a stage is read once per process: a fresh module is a fresh process.
    vi.resetModules();
    const fresh = await import('../../src/client/fn.js');
    const stages = await import('../../src/client/stages/index.js');
    const wire = echo();
    const call = fresh.$fn<AnyForm, unknown>({
      name: 'save',
      method: 'PUT',
      url: '/_fudic/fn/c/x/save',
      chain: [chain().compress(MEASURED)],
      stages: stages.FORM_STAGES,
    });
    expect(await call(make(long))).toEqual(long);
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
