/**
 * SDD-67 §3.5 and §4.1, criteria 15–17, at run time: the rules under the arguments of a function,
 * with `FnSpec` written by hand as the emitter will write them. The browser checks them before
 * anything leaves; the server checks them again before the chain, with the same code and the
 * same `detail`. Skipping the browser skips nothing.
 *
 * Criterion 17 runs every case twice: as an argument — of the route, of `query` and of the body —
 * and as a field of a form with the same validator. Both must say the same.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { arr, form, max, maxLength, min, minLength, pattern, required, str, u8 } from '@fudic/forms/contract';
import type { AnyForm, AnyNode, Validator } from '@fudic/forms';
import type { ArgRule, FnSpec } from '../../src/contract/index.js';
import { checkRules } from '../../src/contract/rules.js';
import { HttpError } from '../../src/errors.js';
import { jsonWire } from '../../src/wire/json.js';
import type { Ty } from '../../src/wire/ty.js';
import { binProblem } from '../helpers.js';
import { browser, call, serve, type Over } from '../body/harness.js';

beforeEach(browser);
afterEach(() => vi.unstubAllGlobals());

/** A rule as the emitter writes it. */
const rule = (check: Validator<never>, name: string, args: readonly unknown[], text?: string): ArgRule => ({
  check,
  name,
  args,
  ...(text !== undefined ? { text } : {}),
});

const REQUIRED = rule(required as Validator<never>, 'required', []);
const MAX_80 = rule(maxLength(80) as Validator<never>, 'max-length', [80]);
const MIN_18 = rule(min(18) as Validator<never>, 'min', [18]);

/** What a call ends in: its value, or the 400 it was refused with, and whether a request left. */
async function attempt(over: Over, value: Record<string, unknown>): Promise<{ detail?: string; sent: number; ran: number }> {
  const ran = vi.fn(() => true);
  const wire = serve(ran, { ...over, returns: 'bool' });
  const e = await call({ ...over, returns: 'bool' })(value as never).then(
    () => undefined,
    (x: unknown) => x,
  );
  if (e === undefined) return { sent: wire.length, ran: ran.mock.calls.length };
  expect(e).toBeInstanceOf(HttpError);
  expect((e as HttpError).status).toBe(400);
  return { detail: (e as HttpError).problem.detail!, sent: wire.length, ran: ran.mock.calls.length };
}

/** The same request, with the browser's rules skipped: the server alone decides. */
async function byHand(over: Over, value: Record<string, unknown>): Promise<{ status: number; detail?: string; ran: number }> {
  const ran = vi.fn(() => true);
  serve(ran, { ...over, returns: 'bool' });
  const { rules: _, ...bare } = over;
  let response: Response | undefined;
  const fetch = globalThis.fetch;
  vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
    const res = (await fetch(url, init)) as Response;
    response = res.clone();
    return res;
  });
  await call({ ...bare, returns: 'bool' })(value as never).catch(() => undefined);
  const res = response!;
  return {
    status: res.status,
    ...(res.status === 400 ? { detail: (await binProblem(res)).detail! } : {}),
    ran: ran.mock.calls.length,
  };
}

describe('criterion 15: max-length 80 on name str', () => {
  const over: Over = { args: { name: 'str' }, rules: { name: [MAX_80] } };

  it('81 characters are refused in the browser with a 400, and no request leaves', async () => {
    const r = await attempt(over, { name: 'x'.repeat(81) });
    expect(r).toEqual({ detail: 'argument name: max-length 80', sent: 0, ran: 0 });
  });

  it('80 characters go', async () => {
    expect(await attempt(over, { name: 'x'.repeat(80) })).toEqual({ sent: 1, ran: 1 });
  });

  it('the same request sent by hand: the same 400 from the server, and the handler never runs', async () => {
    expect(await byHand(over, { name: 'x'.repeat(81) })).toEqual({ status: 400, detail: 'argument name: max-length 80', ran: 0 });
    expect(await byHand(over, { name: 'x'.repeat(80) })).toEqual({ status: 200, ran: 1 });
  });

  it('with use json, the same, both sides', async () => {
    const json: Over = { ...over, wire: jsonWire };
    expect(await attempt(json, { name: 'x'.repeat(81) })).toEqual({ detail: 'argument name: max-length 80', sent: 0, ran: 0 });
    const ran = vi.fn(() => true);
    serve(ran, { ...json, returns: 'bool' });
    const res = await fetch(new URL('https://app.test/_fudic/fn/components/x/save'), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'x'.repeat(81) }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).detail).toBe('argument name: max-length 80');
    expect(ran).not.toHaveBeenCalled();
  });
});

describe('criterion 16: the text of a rule is the detail', () => {
  it('min 18 "Too young."', async () => {
    const over: Over = { args: { age: 'u8' }, rules: { age: [rule(min(18) as Validator<never>, 'min', [18], 'Too young.')] } };
    expect((await attempt(over, { age: 17 })).detail).toBe('Too young.');
    expect((await byHand(over, { age: 17 })).detail).toBe('Too young.');
  });

  it('without a text: argument <name>: <rule> <arguments>', async () => {
    const over: Over = { args: { age: 'u8' }, rules: { age: [MIN_18] } };
    expect((await attempt(over, { age: 17 })).detail).toBe('argument age: min 18');
    const re = rule(pattern(/^[a-z]+$/u) as Validator<never>, 'pattern', ['slug']);
    expect((await attempt({ args: { s: 'str' }, rules: { s: [re] } }, { s: 'A1' })).detail).toBe('argument s: pattern slug');
    expect((await attempt({ args: { s: { opt: 'str' } }, rules: { s: [REQUIRED] } }, {})).detail).toBe('argument s: required');
  });
});

describe('§4.1: the order', () => {
  it('argument by argument as declared, rule by rule as written: the first that fails', async () => {
    const over: Over = {
      args: { name: 'str', age: 'u8' },
      rules: {
        name: [rule(minLength(2) as Validator<never>, 'min-length', [2]), MAX_80],
        age: [MIN_18],
      },
    };
    expect((await attempt(over, { name: 'x'.repeat(81), age: 1 })).detail).toBe('argument name: max-length 80');
    expect((await attempt(over, { name: 'a', age: 1 })).detail).toBe('argument name: min-length 2');
    expect((await attempt(over, { name: 'ana', age: 1 })).detail).toBe('argument age: min 18');
  });

  it('the types are checked first: a value that is not its type never reaches a rule', async () => {
    const r = await attempt({ args: { age: 'u8' }, rules: { age: [MIN_18] } }, { age: 300 });
    expect(r.detail).toBe('argument age is not a valid u8');
  });

  it('an async rule is awaited; a function without rules checks nothing', async () => {
    const slow = rule((async (v: string | null) => (v === 'no' ? { no: true } : null)) as unknown as Validator<never>, 'slow', []);
    expect((await attempt({ args: { s: 'str' }, rules: { s: [slow] } }, { s: 'no' })).detail).toBe('argument s: slow');
    await expect(checkRules(undefined, { s: 'no' })).resolves.toBeUndefined();
  });
});

/**
 * Criterion 17: the six rules accept and reject the same values on an argument as on a field.
 * Each case: the type of the argument, the control of the field, the rule, and the values with
 * what each should get.
 */
interface Case {
  readonly name: string;
  readonly ty: Ty;
  readonly control: (validators: readonly Validator<never>[]) => AnyNode;
  readonly rule: ArgRule;
  /** `[value, accepted]`; `null` stands for an absent argument and an empty field. */
  readonly values: readonly (readonly [unknown, boolean])[];
}

const CASES: readonly Case[] = [
  { name: 'required', ty: { opt: 'str' }, control: (v) => str('', v as never), rule: REQUIRED, values: [['a', true], ['', false], [null, false]] },
  { name: 'min', ty: { opt: 'u8' }, control: (v) => u8(null, v as never), rule: MIN_18, values: [[17, false], [18, true], [200, true], [null, true]] },
  { name: 'max', ty: { opt: 'u8' }, control: (v) => u8(null, v as never), rule: rule(max(99) as Validator<never>, 'max', [99]), values: [[99, true], [100, false], [null, true]] },
  {
    name: 'min-length',
    ty: { opt: 'str' },
    control: (v) => str('', v as never),
    rule: rule(minLength(2) as Validator<never>, 'min-length', [2]),
    values: [['a', false], ['ab', true], ['', true], [null, true]],
  },
  {
    name: 'max-length',
    ty: { opt: 'str' },
    control: (v) => str('', v as never),
    rule: rule(maxLength(3) as Validator<never>, 'max-length', [3]),
    values: [['abc', true], ['abcd', false], ['', true]],
  },
  {
    name: 'max-length on a list',
    ty: { opt: { list: 'str' } },
    control: (v) => arr(str, [], v as never),
    rule: rule(maxLength(2) as Validator<never>, 'max-length', [2]),
    values: [[['a', 'b'], true], [['a', 'b', 'c'], false], [[], true]],
  },
  {
    name: 'pattern',
    ty: { opt: 'str' },
    control: (v) => str('', v as never),
    rule: rule(pattern(/^[a-z]+$/u) as Validator<never>, 'pattern', ['lower']),
    values: [['abc', true], ['ab1', false], ['', true], [null, true]],
  },
];

/** Whether a form field with the same validator takes `value`. */
async function asField(c: Case, value: unknown): Promise<boolean> {
  const f = form({ v: c.control([c.rule.check]) }) as unknown as AnyForm;
  f.$set({ v: value } as never);
  return f.$validate();
}

type Place = 'route' | 'query' | 'body';

/** The function with the case's argument `v` in `place`. */
function placed(c: Case, place: Place): Over {
  const rules = { v: [c.rule] };
  if (place === 'route') {
    const ty = typeof c.ty !== 'string' && 'opt' in c.ty ? c.ty.opt : c.ty;
    return { route: [':v'], params: { v: ty }, rules };
  }
  return place === 'query' ? { query: { v: c.ty }, rules } : { args: { v: c.ty }, rules };
}

/** Whether a route can carry it: a route segment is a non-empty scalar. */
const inRoute = (value: unknown): boolean => value !== null && value !== '' && !Array.isArray(value);
/** Whether a query key can carry it: a scalar written as text. */
const inQuery = (value: unknown): boolean => !Array.isArray(value);

describe('criterion 17: the six rules say on an argument what they say on a field', () => {
  for (const c of CASES) {
    for (const [value, accepted] of c.values) {
      const label = `${c.name}: ${JSON.stringify(value)} ${accepted ? 'goes' : 'is refused'}`;

      it(`${label}, as a field`, async () => {
        expect(await asField(c, value)).toBe(accepted);
      });

      for (const place of ['route', 'query', 'body'] as const) {
        if (place === 'route' && !inRoute(value)) continue;
        if (place === 'query' && !inQuery(value)) continue;
        it(`${label}, as an argument of the ${place}, in the browser and on the server`, async () => {
          const over = placed(c, place);
          const args = value === null ? {} : { v: value };
          const browserSide = await attempt(over, args);
          expect(browserSide.detail === undefined).toBe(accepted);
          const serverSide = await byHand(over, args);
          expect(serverSide.status).toBe(accepted ? 200 : 400);
          expect(serverSide.ran).toBe(accepted ? 1 : 0);
          if (!accepted) expect(serverSide.detail).toBe(browserSide.detail);
        });
      }
    }
  }

  it('the six are all there', () => {
    expect(new Set(CASES.map((c) => c.rule.name))).toEqual(new Set(['required', 'min', 'max', 'min-length', 'max-length', 'pattern']));
  });
});

/** An argument of a route is never absent: its rule still runs. */
describe('a rule on a route argument', () => {
  it('min 18 on /:age', async () => {
    const over: Over = { route: [':age'], params: { age: 'u8' }, rules: { age: [MIN_18] } };
    expect((await attempt(over, { age: 17 })).detail).toBe('argument age: min 18');
    expect(await byHand(over, { age: 17 })).toEqual({ status: 400, detail: 'argument age: min 18', ran: 0 });
  });
});

// The `FnSpec` type is what the emitter writes: a rule is data, not a change of type.
const _typed: Pick<FnSpec, 'rules'> = { rules: { name: [MAX_80] } };
void _typed;
