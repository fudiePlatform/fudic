/**
 * SDD-56 §3.8 and criterion 14: `inject()` and `publish()` without a container, on the server.
 *
 * The package only holds the hook; the store is whoever installs it. Here the store is a real
 * `AsyncLocalStorage`, as `@fudic/http/server` installs it, so the concurrency case is the
 * real one: two requests interleaved by an `await`, each finding its own root.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createChild,
  createRoot,
  inject,
  injectFrom,
  publish,
  seedOf,
  Service,
  setAmbient,
  token,
  type Container,
} from '../src/index.js';
import { ambientContainer } from '../src/ambient.js';

class Users {
  static count = 0;
  readonly id = `Users#${++Users.count}`;
}
Service(Users);

/** A service whose field asks for another one: the factory's own ambient. */
class Repo {
  readonly users = inject(Users);
}
Service(Repo);

const LINES = token<readonly string[]>('lines');
const NEVER = token<string>('never-provided');

const tick = () => new Promise((r) => setTimeout(r, 5));

afterEach(() => setAmbient(() => undefined));

describe('without a source installed', () => {
  it('ambientContainer is undefined, and inject and publish throw as before', async () => {
    // A module of its own, so no earlier `setAmbient` in this file has run on it.
    vi.resetModules();
    const fresh = await import('../src/index.js');
    const ambient = await import('../src/ambient.js');
    expect(ambient.ambientContainer()).toBeUndefined();
    expect(() => fresh.inject(Users)).toThrow(/outside a factory: there is no ambient container/u);
    expect(() => fresh.publish(LINES, [])).toThrow(/publish\(lines\) outside a request/u);
  });
});

describe('with a source that answers nothing (outside a request)', () => {
  it('inject throws the error of today', () => {
    setAmbient(() => undefined);
    expect(ambientContainer()).toBeUndefined();
    expect(() => inject(Users)).toThrow('inject(Users) outside a factory: there is no ambient container');
  });

  it('publish throws, naming the token', () => {
    setAmbient(() => undefined);
    expect(() => publish(LINES, ['a'])).toThrow('publish(lines) outside a request: there is no ambient container');
  });
});

describe('with a request container installed', () => {
  it('inject resolves from it, the same instance injectFrom gives', () => {
    const root = createRoot();
    setAmbient(() => root);
    expect(ambientContainer()).toBe(root);
    expect(inject(Users)).toBe(injectFrom(root, Users));
  });

  it('inject passes its options through', () => {
    const root = createRoot();
    setAmbient(() => root);
    expect(inject(NEVER, { optional: true })).toBeUndefined();
    expect(() => inject(NEVER)).toThrow();
  });

  it('publish writes into the root of the request, from any container of the page', () => {
    const root = createRoot();
    const deep = createChild(root, 'app-a');
    setAmbient(() => deep);
    publish(LINES, ['a', 'b']);
    expect(seedOf(root)).toEqual({ lines: ['a', 'b'] });
    expect(inject(LINES)).toEqual(['a', 'b']);
  });

  it('inside a factory, the factory wins over the request', () => {
    const request = createRoot();
    const other = createRoot();
    setAmbient(() => other);
    const repo = injectFrom(request, Repo);
    // The field initializer of Repo ran inside the factory of `request`, not `other`.
    expect(repo.users).toBe(injectFrom(request, Users));
    expect(repo.users).not.toBe(injectFrom(other, Users));
  });

  it('the source is read on every call, not captured once', () => {
    let current: Container | undefined = createRoot();
    setAmbient(() => current);
    const first = inject(Users);
    current = createRoot();
    expect(inject(Users)).not.toBe(first);
    current = undefined;
    expect(() => inject(Users)).toThrow();
  });
});

describe('criterion 14: two concurrent requests, an AsyncLocalStorage between them', () => {
  const store = new AsyncLocalStorage<Container>();

  /** A `load` with an `await` between two `inject`s, publishing what it saw. */
  async function load(label: string, delay: number): Promise<{ first: Users; second: Users; root: Container }> {
    const first = inject(Users);
    await new Promise((r) => setTimeout(r, delay));
    const second = inject(Users);
    publish(LINES, [label]);
    await tick();
    return { first, second, root: ambientContainer()! };
  }

  it('each gets its own container, and what each publishes is only in its own', async () => {
    setAmbient(() => store.getStore());
    const rootA = createRoot();
    const rootB = createRoot();

    // A starts first and waits longer: B runs entirely inside A's await.
    const [a, b] = await Promise.all([
      store.run(rootA, () => load('a', 20)),
      store.run(rootB, () => load('b', 1)),
    ]);

    expect(a.root).toBe(rootA);
    expect(b.root).toBe(rootB);
    expect(a.first).toBe(a.second);
    expect(b.first).toBe(b.second);
    expect(a.first).not.toBe(b.first);
    expect(a.first).toBe(injectFrom(rootA, Users));
    expect(b.first).toBe(injectFrom(rootB, Users));

    expect(seedOf(rootA)).toEqual({ lines: ['a'] });
    expect(seedOf(rootB)).toEqual({ lines: ['b'] });
  });

  it('outside store.run the same source answers nothing', () => {
    setAmbient(() => store.getStore());
    expect(() => inject(Users)).toThrow(/outside a factory/u);
  });
});
