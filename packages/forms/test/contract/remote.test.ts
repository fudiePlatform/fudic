/**
 * SDD-80 §4.3 and criteria 11–16: the browser half of a `runs remote` rule — one question per
 * use, after `debounce`, aborted by the next one, kept in a cache, and every failure passing as
 * valid — and the submit, which does not ask.
 *
 * The server is a fake `fetch` and the clock a fake one. Both formats are stand-ins with the
 * shape of `@fudic/http`'s (the real ones are exercised end to end in `@fudic/http`).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { askRemote, rule, type RuleSpec } from '../../src/contract/index.js';
import { control } from '../../src/control.js';
import { form } from '../../src/form.js';

const bytes = (value: unknown): Uint8Array<ArrayBuffer> => new TextEncoder().encode(JSON.stringify(value)) as Uint8Array<ArrayBuffer>;
const parse = (body: Uint8Array): unknown => JSON.parse(new TextDecoder().decode(body));

/** A `fud-bin` stand-in: its bytes are JSON, its name and type are binary's. */
const binWire = {
  name: 'fud-bin' as const,
  type: 'application/x-fud-bin',
  encodeArgs: (_types: unknown, args: Readonly<Record<string, unknown>>) => bytes(args),
  decodeValue: (_ty: unknown, body: Uint8Array) => parse(body),
};
const jsonWire = {
  name: 'json' as const,
  type: 'application/json',
  encodeArgs: (_types: unknown, args: Readonly<Record<string, unknown>>) => JSON.stringify(args),
  decodeValue: (_ty: unknown, body: Uint8Array) => parse(body),
};

/** One question as the server saw it. */
interface Asked {
  readonly url: string;
  readonly headers: Headers;
  readonly body: { readonly value: unknown; readonly params: unknown };
  readonly signal: AbortSignal;
}

/**
 * The server: answers each question with what `reply` says. `hold` keeps the answers until the
 * test releases them, and an aborted question rejects as `fetch` does.
 */
function server(reply: (value: unknown) => Response | Promise<Response> = (v) => new Response(bytes(v === 'admin' ? 'alias-taken' : null))) {
  const asked: Asked[] = [];
  const held: (() => void)[] = [];
  let hold = false;
  const fetch = vi.fn((url: URL, init: RequestInit) => {
    const body = init.body;
    const text = typeof body === 'string' ? body : new TextDecoder().decode(body as Uint8Array);
    const question: Asked = { url: url.href, headers: new Headers(init.headers), body: JSON.parse(text), signal: init.signal! };
    asked.push(question);
    return new Promise<Response>((resolve, reject) => {
      question.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      const answer = (): void => void Promise.resolve().then(() => reply(question.body.value)).then(resolve, reject);
      if (hold) held.push(answer);
      else answer();
    });
  });
  vi.stubGlobal('fetch', fetch);
  return {
    asked,
    hold: () => {
      hold = true;
    },
    release: () => {
      for (const answer of held.splice(0)) answer();
    },
  };
}

/** `alias-taken` of `rules/people`, in the browser, as the generated module writes it. */
function aliasTaken(over: Partial<RuleSpec> = {}) {
  return rule<string>({
    id: 'rules/people',
    name: 'alias-taken',
    fails: [['alias-taken', []]],
    remote: true,
    async: true,
    debounce: 300,
    ask: askRemote,
    value: 'str',
    params: {},
    wire: binWire,
    sig: 'a1b2c3d4',
    ...over,
  });
}

/** A form with one field under the rule; `type` writes a value and validates it, as a keystroke does. */
function aliasForm(over: Partial<RuleSpec> = {}) {
  const f = form({ alias: control('', [aliasTaken(over).use()]) });
  const type = (value: string): Promise<boolean> => {
    f.alias.set(value);
    return f.alias.validate();
  };
  return { f, type };
}

/** Lets the timers of `ms` run, and what they started settle. */
const wait = (ms: number): Promise<void> => vi.advanceTimersByTimeAsync(ms).then(() => undefined);

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('location', { origin: 'https://app.test' });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the question', () => {
  it('is a POST to the route of the rule, in its format, with its signature, the value and the parameters', async () => {
    const s = server();
    const { f, type } = aliasForm();
    const done = type('admin');
    await wait(300);
    expect(await done).toBe(false);
    expect(f.alias.errors()).toEqual({ aliasTaken: true });
    const [q] = s.asked;
    expect(q!.url).toBe('https://app.test/_fudic/rule/rules/people/alias-taken');
    expect(q!.headers.get('content-type')).toBe('application/x-fud-bin');
    expect(q!.headers.get('fud-sig')).toBe('a1b2c3d4');
    expect(q!.body).toEqual({ value: 'admin', params: {} });
  });

  it('a free value passes', async () => {
    server();
    const { f, type } = aliasForm();
    const done = type('pedro');
    await wait(300);
    expect(await done).toBe(true);
    expect(f.alias.errors()).toBeNull();
  });

  it('with `use json`: no signature, and `{ ok, fails }` is the verdict', async () => {
    const s = server((v) => new Response(JSON.stringify(v === 'admin' ? { ok: false, fails: 'alias-taken' } : { ok: true })));
    const r =rule<string>({ id: 'rules/people', name: 'alias-taken', fails: [['alias-taken', []]], remote: true, async: true, ask: askRemote, value: 'str', params: {}, wire: jsonWire });
    const g = form({ alias: control('', [r.use()]) });
    g.alias.set('admin');
    const taken = g.alias.validate();
    // No `debounce` in the spec: it asks on the next turn of the clock.
    await wait(0);
    expect(await taken).toBe(false);
    expect(g.alias.errors()).toEqual({ aliasTaken: true });
    expect(s.asked[0]!.headers.has('fud-sig')).toBe(false);
    expect(s.asked[0]!.headers.get('content-type')).toBe('application/json');
    g.alias.set('pedro');
    const free = g.alias.validate();
    await wait(0);
    expect(await free).toBe(true);
    expect(g.alias.errors()).toBeNull();
  });

  it('carries the parameters of the use, and the error reports them', async () => {
    const s = server(() => new Response(bytes('too-close')));
    const r = rule<string, { gap: number }>({
      id: 'rules/people',
      name: 'too-close',
      fails: [['too-close', ['gap']]],
      remote: true,
      async: true,
      debounce: 0,
      ask: askRemote,
      value: 'str',
      params: { gap: 'u8' },
      wire: binWire,
    });
    const encode = vi.spyOn(binWire, 'encodeArgs');
    const f = form({ alias: control('', [r.use({ gap: 3 })]) });
    f.alias.set('x');
    const done = f.alias.validate();
    await wait(0);
    expect(await done).toBe(false);
    expect(s.asked[0]!.body).toEqual({ value: 'x', params: { gap: 3 } });
    expect(f.alias.errors()).toEqual({ tooClose: 3 });
    // The types the server conforms the question with: the value, and the parameters as an object.
    const types = encode.mock.calls[0]![0] as { value: unknown; params: { fields: () => unknown } };
    expect(types.value).toBe('str');
    expect(types.params.fields()).toEqual({ gap: 'u8' });
    encode.mockRestore();
  });

  it('a code the declaration does not have fails as the first one', async () => {
    server(() => new Response(bytes('something-else')));
    const { f, type } = aliasForm();
    const done = type('admin');
    await wait(300);
    await done;
    expect(f.alias.errors()).toEqual({ aliasTaken: true });
  });
});

describe('debounce (criterion 11)', () => {
  it('a, ad, adm, admin in less than 300 ms ask once, about admin', async () => {
    const s = server();
    const { f, type } = aliasForm();
    for (const value of ['a', 'ad', 'adm']) {
      void type(value);
      await wait(100);
    }
    const last = type('admin');
    await wait(299);
    expect(s.asked).toHaveLength(0);
    await wait(1);
    expect(await last).toBe(false);
    expect(s.asked.map((q) => q.body.value)).toEqual(['admin']);
    expect(f.alias.errors()).toEqual({ aliasTaken: true });
  });

  it('`debounce 0` asks on the next turn of the clock', async () => {
    const s = server();
    const { type } = aliasForm({ debounce: 0 });
    const done = type('admin');
    expect(s.asked).toHaveLength(0);
    await wait(0);
    expect(await done).toBe(false);
    expect(s.asked).toHaveLength(1);
  });
});

describe('abort (criterion 12)', () => {
  it('a new value aborts the question in flight, and what is painted is the verdict of the new one', async () => {
    const s = server();
    s.hold();
    const { f, type } = aliasForm();
    const first = type('pedro');
    await wait(300);
    expect(s.asked).toHaveLength(1);
    const second = type('admin');
    // The first question is cancelled, and what it was asked passes.
    expect(s.asked[0]!.signal.aborted).toBe(true);
    await first;
    await wait(300);
    expect(s.asked).toHaveLength(2);
    s.release();
    expect(await second).toBe(false);
    expect(f.alias.errors()).toEqual({ aliasTaken: true });
  });

  it('a new value before the wait is over cancels the wait: nothing is asked for the old one', async () => {
    const s = server();
    const { type } = aliasForm();
    const first = type('pedro');
    await wait(100);
    const second = type('admin');
    await first;
    await wait(300);
    await second;
    expect(s.asked.map((q) => q.body.value)).toEqual(['admin']);
  });
});

describe('the cache (criterion 13)', () => {
  it('going back from pedro to admin does not ask again, and answers at once', async () => {
    const s = server();
    const { f, type } = aliasForm();
    const admin = type('admin');
    await wait(300);
    await admin;
    const pedro = type('pedro');
    await wait(300);
    await pedro;
    expect(s.asked).toHaveLength(2);
    // Answered at once: the error is on record before anything awaits.
    void type('admin');
    expect(f.alias.errors()).toEqual({ aliasTaken: true });
    expect(f.alias.pending()).toBe(false);
    await wait(300);
    expect(s.asked).toHaveLength(2);
  });

  it('a value in the cache aborts the question in flight of another one', async () => {
    const s = server();
    const { f, type } = aliasForm();
    const admin = type('admin');
    await wait(300);
    await admin;
    s.hold();
    void type('pedro');
    await wait(300);
    void type('admin');
    expect(s.asked[1]!.signal.aborted).toBe(true);
    s.release();
    await wait(0);
    expect(f.alias.errors()).toEqual({ aliasTaken: true });
  });
});

describe('a failure passes as valid (criterion 14)', () => {
  it.each([
    ['the network down', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['a 500', () => new Response('boom', { status: 500 })],
    ['a 401', () => new Response('', { status: 401 })],
    ['a 429', () => new Response('', { status: 429 })],
    ['a body that is not a verdict', () => new Response('not json')],
  ] as const)('%s: no error, not pending, valid — and it is not kept', async (_, reply) => {
    const s = server(reply);
    const { f, type } = aliasForm();
    const done = type('admin');
    await wait(300);
    expect(await done).toBe(true);
    expect(f.alias.errors()).toBeNull();
    expect(f.alias.pending()).toBe(false);
    expect(f.alias.valid()).toBe(true);
    expect(f.$valid()).toBe(true);
    // Not kept: the next time it asks again.
    const other = type('pedro');
    await wait(300);
    await other;
    const again = type('admin');
    await wait(300);
    await again;
    expect(s.asked.map((q) => q.body.value)).toEqual(['admin', 'pedro', 'admin']);
  });
});

describe('pending (criterion 15)', () => {
  it('is true from the keystroke to the answer, for the field and the form, and the form is not valid meanwhile', async () => {
    const s = server();
    s.hold();
    const { f, type } = aliasForm();
    expect(f.alias.pending()).toBe(false);
    const done = type('pedro');
    expect(f.alias.pending()).toBe(true);
    expect(f.$pending()).toBe(true);
    expect(f.$valid()).toBe(false);
    await wait(300);
    // In flight: still pending.
    expect(f.alias.pending()).toBe(true);
    s.release();
    expect(await done).toBe(true);
    expect(f.alias.pending()).toBe(false);
    expect(f.$pending()).toBe(false);
    expect(f.$valid()).toBe(true);
  });
});

describe('the submit does not ask (criterion 16)', () => {
  it('$validate() asks nothing, and a value nobody asked about passes: the server decides', async () => {
    const s = server();
    const { f } = aliasForm();
    f.alias.set('admin');
    expect(await f.$validate()).toBe(true);
    await wait(300);
    expect(s.asked).toHaveLength(0);
  });

  it('a failure in the cache for the current value stops it, with no question', async () => {
    const s = server();
    const { f, type } = aliasForm();
    const done = type('admin');
    await wait(300);
    await done;
    expect(await f.$validate()).toBe(false);
    expect(f.$errors()).toEqual({ alias: { aliasTaken: true } });
    expect(s.asked).toHaveLength(1);
  });

  it('aborts the question in flight, and the wait', async () => {
    const s = server();
    s.hold();
    const { f, type } = aliasForm();
    const typed = type('admin');
    await wait(300);
    expect(await f.$validate()).toBe(true);
    expect(s.asked[0]!.signal.aborted).toBe(true);
    expect(await typed).toBe(true);
    expect(f.alias.pending()).toBe(false);

    const waiting = type('admina');
    expect(await f.$validate()).toBe(true);
    await waiting;
    await wait(300);
    expect(s.asked).toHaveLength(1);
  });

  it('on the server a remote rule is checked by its check, never asked', async () => {
    const s = server();
    const r = rule<string>({
      id: 'rules/people',
      name: 'alias-checked',
      fails: [['alias-taken', []]],
      server: true,
      remote: true,
      async: true,
      ask: askRemote,
    });
    r.check((v) => v !== 'admin');
    const f = form({ alias: control('admin', [r.use()]) });
    expect(await f.$validate({ server: true })).toBe(false);
    expect(s.asked).toHaveLength(0);
  });
});

describe('without `ask`', () => {
  it('the browser skips a remote rule as a server one', async () => {
    const s = server();
    const { f } = aliasForm({ ask: undefined as never });
    f.alias.set('admin');
    expect(await f.alias.validate()).toBe(true);
    await wait(300);
    expect(s.asked).toHaveLength(0);
  });
});
