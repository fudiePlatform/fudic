/**
 * `hooks()` — the list of an instance's lifecycle hooks (SDD-86 §3.5, §4.1, §4.2, §4.4).
 *
 * The emit creates one per instance inside `$owned`, rewrites every `afterHydrate(fn)` of the
 * author's `@code` to `$hk.add("afterHydrate", fn)`, and calls `run` / `on` / `off` /
 * `dispose` from `h`, `c`, the element's callbacks and `r`. What is checked here is the order,
 * the host each function receives, the cleanups, the idempotence of connecting, and that one
 * function that throws never stops the rest.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hooks, type HookKind } from '../src/index.js';

let host: HTMLElement;
let reported: unknown[];

beforeEach(() => {
  host = document.createElement('app-card');
  reported = [];
  vi.stubGlobal('reportError', (e: unknown) => {
    reported.push(e);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A recorder: `fn(name)` logs `name` with the host it got and returns `ret`. */
function recorder(): {
  log: string[];
  fn: (name: string, ret?: unknown) => (h: HTMLElement) => unknown;
} {
  const log: string[] = [];
  return {
    log,
    fn: (name, ret) => (h) => {
      log.push(h === host ? name : `${name}:wrong-host`);
      return ret;
    },
  };
}

describe('run — the four before / after moments (§3.5)', () => {
  const KINDS = ['beforeHydrate', 'afterHydrate', 'beforeCreate', 'afterCreate'] as const;

  for (const kind of KINDS) {
    it(`${kind}: every function, in the order it was added, with the host`, () => {
      const { log, fn } = recorder();
      const hk = hooks();
      hk.add(kind, fn('1'));
      hk.add(kind, fn('2'));
      hk.add(kind, fn('3'));
      hk.run(kind, host);
      expect(log).toEqual(['1', '2', '3']);
    });
  }

  it('runs only the kind it is asked for', () => {
    const { log, fn } = recorder();
    const hk = hooks();
    for (const kind of ['beforeHydrate', 'afterHydrate', 'beforeCreate', 'afterCreate', 'onConnect', 'onDisconnect', 'onDispose'] as HookKind[]) {
      hk.add(kind, fn(kind));
    }
    hk.run('afterHydrate', host);
    expect(log).toEqual(['afterHydrate']);
  });

  it('a kind nobody added runs nothing and throws nothing', () => {
    expect(() => hooks().run('beforeCreate', host)).not.toThrow();
    expect(reported).toEqual([]);
  });
});

describe('on / off — connecting, without repeating (§4.2)', () => {
  it('on runs every onConnect in order; off runs every onDisconnect in order', () => {
    const { log, fn } = recorder();
    const hk = hooks();
    hk.add('onConnect', fn('c1'));
    hk.add('onConnect', fn('c2'));
    hk.add('onDisconnect', fn('d1'));
    hk.add('onDisconnect', fn('d2'));
    hk.on(host);
    hk.off(host);
    expect(log).toEqual(['c1', 'c2', 'd1', 'd2']);
  });

  it('on twice in a row runs onConnect once', () => {
    const { log, fn } = recorder();
    const hk = hooks();
    hk.add('onConnect', fn('c'));
    hk.on(host);
    hk.on(host);
    expect(log).toEqual(['c']);
  });

  it('off before any on does nothing — the component starts disconnected', () => {
    const { log, fn } = recorder();
    const hk = hooks();
    hk.add('onDisconnect', fn('d'));
    hk.off(host);
    expect(log).toEqual([]);
  });

  it('off twice in a row runs onDisconnect once', () => {
    const { log, fn } = recorder();
    const hk = hooks();
    hk.add('onDisconnect', fn('d'));
    hk.on(host);
    hk.off(host);
    hk.off(host);
    expect(log).toEqual(['d']);
  });

  it('onConnect and onDisconnect alternate over several moves (§5)', () => {
    const { log, fn } = recorder();
    const hk = hooks();
    hk.add('onConnect', fn('c'));
    hk.add('onDisconnect', fn('d'));
    hk.on(host);
    hk.on(host);
    hk.off(host);
    hk.on(host);
    hk.off(host);
    hk.off(host);
    hk.on(host);
    expect(log).toEqual(['c', 'd', 'c', 'd', 'c']);
  });

  it("the cleanup onConnect returned runs on the next off, BEFORE onDisconnect (§4.1)", () => {
    const { log, fn } = recorder();
    const hk = hooks();
    hk.add('onConnect', fn('c', () => log.push('c-cleanup')));
    hk.add('onDisconnect', fn('d'));
    hk.on(host);
    hk.off(host);
    expect(log).toEqual(['c', 'c-cleanup', 'd']);
  });

  it('each connection gets its own cleanup, run once', () => {
    const log: string[] = [];
    let n = 0;
    const hk = hooks();
    hk.add('onConnect', () => {
      const mine = ++n;
      log.push(`c${mine}`);
      return () => log.push(`cleanup${mine}`);
    });
    hk.on(host);
    hk.off(host);
    hk.off(host);
    hk.on(host);
    hk.off(host);
    expect(log).toEqual(['c1', 'cleanup1', 'c2', 'cleanup2']);
  });

  it('the cleanups of several onConnect run in the order they were registered', () => {
    const log: string[] = [];
    const hk = hooks();
    hk.add('onConnect', () => () => log.push('first'));
    hk.add('onConnect', () => undefined);
    hk.add('onConnect', () => () => log.push('third'));
    hk.on(host);
    hk.off(host);
    expect(log).toEqual(['first', 'third']);
  });

  it('a cleanup receives nothing it has to use, and a non-function return is not a cleanup', () => {
    const hk = hooks();
    hk.add('onConnect', () => 42);
    hk.add('onConnect', () => Promise.resolve());
    hk.on(host);
    expect(() => hk.off(host)).not.toThrow();
    expect(reported).toEqual([]);
  });
});

describe('dispose — the end of the instance (§4.1)', () => {
  it('onDispose first, then the cleanups of afterHydrate / afterCreate, in registration order', () => {
    const { log, fn } = recorder();
    const hk = hooks();
    hk.add('afterHydrate', fn('ah1', () => log.push('ah1-cleanup')));
    hk.add('onDispose', fn('x1'));
    hk.add('afterHydrate', fn('ah2', () => log.push('ah2-cleanup')));
    hk.add('onDispose', fn('x2'));
    hk.run('afterHydrate', host);
    hk.dispose(host);
    expect(log).toEqual(['ah1', 'ah2', 'x1', 'x2', 'ah1-cleanup', 'ah2-cleanup']);
  });

  it('the cleanup of afterCreate runs at dispose too', () => {
    const { log, fn } = recorder();
    const hk = hooks();
    hk.add('afterCreate', fn('ac', () => log.push('ac-cleanup')));
    hk.run('afterCreate', host);
    expect(log).toEqual(['ac']);
    hk.dispose(host);
    expect(log).toEqual(['ac', 'ac-cleanup']);
  });

  it('an after* hook that never ran leaves no cleanup to run', () => {
    const log: string[] = [];
    const hk = hooks();
    hk.add('afterHydrate', () => () => log.push('never'));
    hk.dispose(host);
    expect(log).toEqual([]);
  });

  it('an async afterHydrate (it returns a promise) is not a cleanup — the IndexedDB example of §4.9', () => {
    const hk = hooks();
    hk.add('afterHydrate', async () => undefined);
    hk.run('afterHydrate', host);
    expect(() => hk.dispose(host)).not.toThrow();
    expect(reported).toEqual([]);
  });

  it('onDispose runs once, however many times dispose is called (§5)', () => {
    const { log, fn } = recorder();
    const hk = hooks();
    hk.add('afterHydrate', fn('ah', () => log.push('ah-cleanup')));
    hk.add('onDispose', fn('x'));
    hk.run('afterHydrate', host);
    hk.dispose(host);
    hk.dispose(host);
    expect(log).toEqual(['ah', 'x', 'ah-cleanup']);
  });

  it('the cleanup of onConnect is not dispose’s: off runs it, dispose does not run it again', () => {
    const log: string[] = [];
    const hk = hooks();
    hk.add('onConnect', () => () => log.push('c-cleanup'));
    hk.on(host);
    hk.off(host);
    hk.dispose(host);
    expect(log).toEqual(['c-cleanup']);
  });

  it('a move (off + on) never runs onDispose', () => {
    const { log, fn } = recorder();
    const hk = hooks();
    hk.add('onConnect', fn('c'));
    hk.add('onDisconnect', fn('d'));
    hk.add('onDispose', fn('x'));
    hk.on(host);
    hk.off(host);
    hk.on(host);
    expect(log).toEqual(['c', 'd', 'c']);
  });
});

describe('a hook that throws (§4.4)', () => {
  const boom = (msg: string) => (): never => {
    throw new Error(msg);
  };

  it('run: the error goes to reportError and the next function runs', () => {
    const { log, fn } = recorder();
    const hk = hooks();
    hk.add('afterHydrate', fn('1'));
    hk.add('afterHydrate', boom('ah'));
    hk.add('afterHydrate', fn('3'));
    expect(() => hk.run('afterHydrate', host)).not.toThrow();
    expect(log).toEqual(['1', '3']);
    expect(reported.map((e) => (e as Error).message)).toEqual(['ah']);
  });

  it('on and off: each function on its own', () => {
    const { log, fn } = recorder();
    const hk = hooks();
    hk.add('onConnect', boom('c'));
    hk.add('onConnect', fn('c2'));
    hk.add('onDisconnect', boom('d'));
    hk.add('onDisconnect', fn('d2'));
    hk.on(host);
    hk.off(host);
    expect(log).toEqual(['c2', 'd2']);
    expect(reported.map((e) => (e as Error).message)).toEqual(['c', 'd']);
  });

  it('a throwing cleanup of onConnect does not stop onDisconnect', () => {
    const { log, fn } = recorder();
    const hk = hooks();
    hk.add('onConnect', () => boom('cleanup'));
    hk.add('onDisconnect', fn('d'));
    hk.on(host);
    hk.off(host);
    expect(log).toEqual(['d']);
    expect(reported.map((e) => (e as Error).message)).toEqual(['cleanup']);
  });

  it('dispose: a throwing onDispose or cleanup does not stop the rest', () => {
    const { log, fn } = recorder();
    const hk = hooks();
    hk.add('afterHydrate', () => boom('ah-cleanup'));
    hk.add('afterHydrate', fn('ah2', () => log.push('ah2-cleanup')));
    hk.add('onDispose', boom('x'));
    hk.add('onDispose', fn('x2'));
    hk.run('afterHydrate', host);
    expect(() => hk.dispose(host)).not.toThrow();
    expect(log).toEqual(['ah2', 'x2', 'ah2-cleanup']);
    expect(reported.map((e) => (e as Error).message)).toEqual(['x', 'ah-cleanup']);
  });

  it('a hook that threw is still connected: off afterwards runs onDisconnect', () => {
    const { log, fn } = recorder();
    const hk = hooks();
    hk.add('onConnect', boom('c'));
    hk.add('onDisconnect', fn('d'));
    hk.on(host);
    hk.on(host);
    hk.off(host);
    expect(log).toEqual(['d']);
    expect(reported).toHaveLength(1);
  });
});

describe('two instances, two lists', () => {
  it('hooks() returns a fresh list each time', () => {
    const { log, fn } = recorder();
    const a = hooks();
    const b = hooks();
    a.add('afterHydrate', fn('a'));
    b.run('afterHydrate', host);
    expect(log).toEqual([]);
    a.run('afterHydrate', host);
    expect(log).toEqual(['a']);
  });
});
