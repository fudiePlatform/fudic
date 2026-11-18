/**
 * The lifecycle hooks of a component or a route: what its `@code` registered with
 * `afterHydrate(…)`, `onConnect(…)` and their siblings, and the moments that run them.
 *
 * The emit creates one list per instance inside the code block, rewrites each call to `add`, and
 * calls `run`, `on`, `off` and `dispose` from the controller. Every function runs on its own: one
 * that throws is reported and the rest still run, so a hook can never leave a component half up.
 */

export type HookKind =
  | 'beforeHydrate'
  | 'afterHydrate'
  | 'beforeCreate'
  | 'afterCreate'
  | 'onConnect'
  | 'onDisconnect'
  | 'onDispose';

type HookFn = (host: HTMLElement) => unknown;

export interface Hooks {
  /** Register `fn` for `kind`; functions of one kind run in the order they were added. */
  add(kind: HookKind, fn: HookFn): void;
  /** Run the hooks of a moment of hydrating or creating. An `after*` hook may return its cleanup. */
  run(kind: 'beforeHydrate' | 'afterHydrate' | 'beforeCreate' | 'afterCreate', host: HTMLElement): void;
  /** Connected: run `onConnect`, once until the next `off`. */
  on(host: HTMLElement): void;
  /** Disconnected: the cleanups the last `onConnect` returned, then `onDisconnect`. Once per `on`. */
  off(host: HTMLElement): void;
  /** Destroyed: `onDispose`, then the cleanups of `afterHydrate` / `afterCreate`. Once. */
  dispose(host: HTMLElement): void;
}

/** One function, isolated: what it throws goes to the page's error reporting and nowhere else. */
function call(fn: HookFn, host: HTMLElement): unknown {
  try {
    return fn(host);
  } catch (error) {
    reportError(error);
    return undefined;
  }
}

/** Run each cleanup in `list`, emptying it. */
function flush(list: (() => unknown)[], host: HTMLElement): void {
  for (const cleanup of list.splice(0)) call(cleanup, host);
}

/** The hooks of one instance. For the emit only. */
export function hooks(): Hooks {
  const registered = new Map<HookKind, HookFn[]>();
  const lifeCleanups: (() => unknown)[] = [];
  const connectCleanups: (() => unknown)[] = [];
  let connected = false;
  let disposed = false;

  const each = (kind: HookKind, host: HTMLElement, keep?: (cleanup: () => unknown) => void): void => {
    for (const fn of registered.get(kind) ?? []) {
      const out = call(fn, host);
      if (keep !== undefined && typeof out === 'function') keep(out as () => unknown);
    }
  };

  return {
    add(kind, fn) {
      const list = registered.get(kind);
      if (list === undefined) registered.set(kind, [fn]);
      else list.push(fn);
    },
    run(kind, host) {
      if (kind === 'afterHydrate' || kind === 'afterCreate') each(kind, host, (c) => lifeCleanups.push(c));
      else each(kind, host);
    },
    on(host) {
      if (connected) return;
      connected = true;
      each('onConnect', host, (c) => connectCleanups.push(c));
    },
    off(host) {
      if (!connected) return;
      connected = false;
      flush(connectCleanups, host);
      each('onDisconnect', host);
    },
    dispose(host) {
      if (disposed) return;
      disposed = true;
      each('onDispose', host);
      flush(lifeCleanups, host);
    },
  };
}
