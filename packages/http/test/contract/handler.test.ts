/**
 * SDD-60 §4.4 and criteria 15, 16, 36 — the dispatcher: `/_fudic/fn/<id>/<name><route>` matched
 * against the `<id>` loaded in the process and the route of each function, then served.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { formOf, required, str, u8 } from '@fudic/forms/contract';
import { fn, loadingFile, middleware, page, resetRegistry, use, type FnSpec } from '../../src/contract/index.js';
import { contractsHandler, implementation } from '../../src/contract/server.js';

const ORIGIN = 'https://app.test';

/** What the last handler was given. */
let seen: Record<string, unknown> | undefined;
const record = (answer: unknown) => (ctx: never): unknown => {
  seen = ctx;
  return answer;
};

const spec = (over: Partial<FnSpec> & Pick<FnSpec, 'id' | 'name'>): FnSpec => ({ method: 'GET', chain: [], ...over });

afterEach(() => {
  loadingFile(undefined);
  resetRegistry();
  seen = undefined;
});

describe('contractsHandler', () => {
  it('criterion 36: the page params of the <id> and those of the route reach ctx.params', async () => {
    const save = fn(
      spec({ id: 'routes/blog/[slug]', name: 'save', method: 'PUT', route: [':id'], params: { id: 'i32' }, query: { notify: 'bool' }, args: { active: 'bool' } }),
    );
    save.handle(record({ saved: true }));
    const handle = contractsHandler();
    const response = await handle(
      new Request(`${ORIGIN}/_fudic/fn/routes/blog/mi%20post/save/42?notify=true`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ active: false }),
      }),
    );
    expect(response!.status).toBe(200);
    expect(await response!.json()).toEqual({ saved: true });
    expect(seen!['params']).toEqual({ slug: 'mi post', id: 42 });
    expect(seen!['query']).toEqual({ notify: true });
    expect(seen!['args']).toEqual({ active: false });
  });

  it('criterion 15: ctx carries what a middleware adds and the validated form, required not null', async () => {
    const auth = middleware<{}, { user: string }>({ id: 'middlewares/auth', name: 'auth', server: true });
    auth.server((ctx, next) => next(Object.assign(ctx, { user: 'ana' })));
    const person = formOf({ name: str('', [required]), age: u8(null, [required]) });
    const save = fn(spec({ id: 'components/user-form', name: 'save', method: 'PUT', form: person, chain: [{ steps: [{ use: [use(auth)] }] }] }));
    save.handle(record(undefined));
    const response = await contractsHandler()(
      new Request(`${ORIGIN}/_fudic/fn/components/user-form/save`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(['Ana', 34]),
      }),
    );
    expect(response!.status).toBe(204);
    expect(seen!['user']).toBe('ana');
    expect((seen!['form'] as { $value(): unknown }).$value()).toEqual({ name: 'Ana', age: 34 });
  });

  it('criterion 16: without an implementation, a 404 whose detail says what is missing only in dev', async () => {
    fn(spec({ id: 'routes/missing', name: 'nobody' }));
    const url = `${ORIGIN}/_fudic/fn/routes/missing/nobody`;
    const dev = await contractsHandler({ dev: true })(new Request(url));
    expect(dev!.status).toBe(404);
    expect((await dev!.json()).detail).toBe('nobody of routes/missing has no implementation in src/server');
    const prod = await contractsHandler()(new Request(url));
    expect(prod!.status).toBe(404);
    expect((await prod!.json()).detail).toBeUndefined();
  });

  it('a literal <id> is tried before one with a parameter', async () => {
    fn(spec({ id: 'routes/shop/[item]', name: 'buy' })).handle(record('param'));
    fn(spec({ id: 'routes/shop/new', name: 'buy' })).handle(record('literal'));
    expect(await (await contractsHandler()(new Request(`${ORIGIN}/_fudic/fn/routes/shop/new/buy`)))!.json()).toBe('literal');
    expect(await (await contractsHandler()(new Request(`${ORIGIN}/_fudic/fn/routes/shop/hat/buy`)))!.json()).toBe('param');
  });

  it('an <id> that matches without that function, or with another route, is a 404', async () => {
    fn(spec({ id: 'routes/items', name: 'get', route: ['lines', ':line'], params: { line: 'i32' } })).handle(record(1));
    const handle = contractsHandler();
    for (const path of ['routes/items', 'routes/items/nope', 'routes/items/get', 'routes/items/get/rows/1']) {
      const response = await handle(new Request(`${ORIGIN}/_fudic/fn/${path}`));
      expect(response!.status).toBe(404);
      expect((await response!.json()).detail).toBe('no such server function');
    }
    expect((await handle(new Request(`${ORIGIN}/_fudic/fn/routes/items/get/lines/7`)))!.status).toBe(200);
  });

  it('a URL outside /_fudic/fn/ is someone else’s: null; one under it that names no function, 404', async () => {
    fn(spec({ id: 'routes/known', name: 'f' }));
    const handle = contractsHandler({ base: '/app/' });
    expect(await handle(new Request(`${ORIGIN}/app/about`))).toBeNull();
    expect(await handle(new Request(`${ORIGIN}/_fudic/fn/routes/known/f`))).toBeNull();
    const unknown = await handle(new Request(`${ORIGIN}/app/_fudic/fn/r/known/f`));
    expect(unknown!.status).toBe(404);
    expect((await unknown!.json()).detail).toBe('no such server function');
  });
});

describe('implementation', () => {
  it('answers what src/server registered, and is an error of the build without it', () => {
    const paths = page<() => string[]>({ id: 'routes/blog/[slug]', name: 'paths' });
    expect(() => implementation(paths)).toThrow('paths of routes/blog/[slug] has no implementation in src/server');
    const list = (): string[] => ['a'];
    paths.handle(list);
    expect(implementation(paths)).toBe(list);
  });
});
