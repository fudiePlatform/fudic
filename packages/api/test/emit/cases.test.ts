/**
 * SDD-60 §3.6–§3.8, §4.3 and criterion 37 (the form's half) — the corners of the emitter: rules
 * on any type and on a form, one-half middlewares, lists, `when`, `require … on`, a layout
 * without `load`, names that do not resolve; and the generated `shop`, evaluated.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyForm } from '@fudic/forms';
import { required, setMessages } from '@fudic/forms/contract';
import type { Rule } from '@fudic/forms/contract';
import { emitDeclarations, emitModule, type ApiContext } from '../../src/index.js';
import { cases } from './_cases.js';
import { load, type Loaded } from './_load.js';

const c = cases();
const CTX: ApiContext = { route: { params: [] } };
const ID = '0190a6b2-7c1e-7d3a-9f00-1a2b3c4d5e6f';

describe('the corners, as text', () => {
  for (const source of [c.extensions, c.shop, c.mixed, c.sloppy]) {
    it(`${source.id}: the .d.ts and both variants`, () => {
      expect(emitDeclarations(source, c.index, CTX)).toMatchSnapshot('d.ts');
      expect(emitModule(source, c.index, CTX, 'server')).toMatchSnapshot('server');
      expect(emitModule(source, c.index, CTX, 'browser')).toMatchSnapshot('browser');
    });
  }

  it('a rule on any value, any list, a form; a middleware with one half', () => {
    const d = emitDeclarations(c.extensions, c.index, CTX);
    expect(d).toContain('export const anyValue: Rule<unknown, {}, never>;');
    expect(d).toContain('export const anyList: Rule<readonly unknown[], {}, never>;');
    expect(d).toContain('export const whole: Rule<Readonly<Record<string, unknown>>, {}, never>;');
    expect(d).toContain("export const tagger: Omit<MiddlewarePiece<{ readonly tags: readonly string[]; readonly limit?: number }, {}>, 'server'>;");
    expect(d).toContain("export const stamp: Omit<MiddlewarePiece<{}, StampAdds>, 'client'>;");
  });

  it('a form rule in a summary is one validator', () => {
    expect(emitModule(c.shop, c.index, CTX, 'server')).toContain('}, [whole.use(), requireRule("some"');
  });

  it('what does not resolve is left out, or unknown', () => {
    const d = emitDeclarations(c.shop, c.index, CTX);
    expect(d).toContain('export type BuyCtx = FnContext<{}, {}, undefined>;');
    const m = emitModule(c.shop, c.index, CTX, 'server');
    expect(m).toContain('{ use: [] }, { skip: [] }');
    expect(m).toContain('export const buy = fn({ id: "routes/shop", name: "buy", method: "POST", wire: binWire, sig: "99f6eca0", chain: [{ steps: [] }] });');
  });

  it('a layout without load and without the props of a layout', () => {
    expect(emitDeclarations(c.shop, c.index, {})).toContain(
      'export type LayoutHandler = (ctx: PageContext<{}>, data: undefined) => Readonly<Record<string, unknown>> | Promise<Readonly<Record<string, unknown>>>;',
    );
  });

  it('the adds of a middleware of the same file need no import', () => {
    expect(emitDeclarations(c.mixed, c.index, CTX)).toContain('export type FCtx = FnContext<{}, {}, undefined> & HereAdds;');
  });

  it('documentation of several lines, and one that would close the comment', () => {
    const source = { ...c.extensions, file: { ...c.extensions.file, declarations: [{ ...c.extensions.file.declarations[0]!, doc: 'One.\nTwo */ three.' }] } };
    expect(emitDeclarations(source, c.index, CTX)).toContain('  /**\n   * One.\n   * Two *\\/ three.\n   */\n  export const anyValue');
  });
});

describe('the shop form, evaluated', () => {
  let server: Loaded;
  let shop: AnyForm;

  beforeAll(async () => {
    server = load(c.index, [...c.index.sources], 'server');
    const rules = await server.module<Record<string, Rule<never, never, never>>>('@fudic/forms/rules');
    rules['minLength']!.check(((v: readonly unknown[], q: { n: number }) => v.length >= q.n) as never);
    rules['required']!.check(((v: unknown) => required(v, undefined as never) === null) as never);
    const ext = await server.module<Record<string, Rule<never, never, never>>>('ext/rules');
    ext['anyValue']!.check((() => true) as never);
    ext['anyList']!.check((() => true) as never);
    ext['dated']!.check((() => true) as never);
    ext['whole']!.check(((v: { qty: number | null }) => v.qty !== 7) as never);
    shop = (await server.module<{ shop: AnyForm }>('routes/shop')).shop;
  });
  afterAll(() => setMessages({}));

  const good = () => ({
    tags: ['a'],
    day: new Date('2026-01-01'),
    since: new Date('2026-02-01'),
    qty: 5,
    price: 1.5,
    id: '',
    sure: true,
    box: { a: 1, b: 2 },
  });

  async function errorsOf(patch: Record<string, unknown>) {
    const f = shop.$fresh();
    f.$set({ ...good(), ...patch } as never);
    await f.$validate({ server: true });
    return { errors: f.$errors(), summary: f.$summary(), box: (f as unknown as { box: AnyForm }).box.$summary() };
  }

  it('starts from the empty value of each type, and the written one', () => {
    expect(shop.$fresh().$value()).toEqual({
      tags: [],
      day: new Date('2026-01-01'),
      since: null,
      qty: null,
      price: null,
      id: '',
      sure: false,
      box: { a: null, b: null },
    });
  });

  it('a valid value passes', async () => {
    expect(await errorsOf({})).toEqual({ errors: null, summary: null, box: null });
  });

  it('criterion 37: a uuid field gives its error and lets the empty value pass; any case is a uuid', async () => {
    expect((await errorsOf({ id: 'abc' })).errors).toEqual({ id: { uuid: true } });
    expect((await errorsOf({ id: ID.toUpperCase() })).errors).toBeNull();
    expect((await errorsOf({ id: '' })).errors).toBeNull();
    const f = shop.$fresh();
    f.$set({ ...good(), id: 'abc' } as never);
    await f.$validate();
    f.$touch();
    expect((f as unknown as { id: { message(): string } }).id.message()).toBe('No es un identificador.');
  });

  it('require … on paints its field; with a text, that text', async () => {
    expect((await errorsOf({ box: { a: 3, b: 2 } })).errors).toEqual({ 'box.b': { ordered: true } });
    expect((await errorsOf({ since: new Date('2025-01-01') })).errors).toEqual({ since: { later: true } });
  });

  it('when: its require only holds when the condition does', async () => {
    expect((await errorsOf({ box: { a: -1, b: 2 } })).box).toEqual({ positive: true });
    expect((await errorsOf({ box: { a: null, b: 2 } })).box).toBeNull();
  });

  it('the summary: a form rule, not, and, or, comparisons, length, literals', async () => {
    expect((await errorsOf({ qty: 7 })).summary).toEqual({ whole: true });
    expect((await errorsOf({ tags: [] })).summary).toEqual({ some: true });
    expect((await errorsOf({ qty: 50 })).summary).toEqual({ sized: true });
    expect((await errorsOf({ qty: 150 })).summary).toBeNull();
    expect((await errorsOf({ box: { a: 3, b: 4 } })).summary).toEqual({ named: true });
    expect((await errorsOf({ sure: false })).summary).toEqual({ named: true });
  });

  it('a list field is a typed list control with its rules', async () => {
    expect((await errorsOf({ tags: [] })).errors).toEqual({ tags: { minLength: 1 } });
  });

  it('a field option and the form options are written as the factories take them', () => {
    const f = shop.$fresh() as unknown as { qty: { validateOn(): number } };
    expect(f.qty.validateOn()).toBe(2);
  });
});
