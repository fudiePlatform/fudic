/**
 * A server function opens with its verb, is configured in the order it is written and closes
 * with `.handle` (SDD-56 §3.1). Immutable: every call returns a new builder, so a base kept in
 * a `const` can be continued twice into two independent functions.
 */

import type { AnyForm } from '@fudic/forms';
import { skipStep, withStep, type Level } from './step.js';
import type { AddsOf, AnyMiddleware, CompressOptions, Method, ServerContext } from './types.js';

/**
 * What the name of a server function is on the server: a descriptor that cannot be called.
 * `dispatch` runs it; in the browser the same name is a `ServerFunction<A, R>`.
 */
export interface ServerFn<A, R> {
  readonly method: Method;
  /** Its own level of the chain: what its builder wrote. */
  readonly level: Level;
  /** The form given to `.form(…)`: the server validates a fresh copy of it. */
  readonly form?: AnyForm;
  readonly invalidates: readonly string[];
  readonly handle: (ctx: ServerContext) => unknown;
  /** Phantom: the arguments it takes and what it resolves to. Never present at runtime. */
  readonly '~call'?: (args: A) => R;
}

export interface FnBuilder<A, C extends object> {
  /** Appends middlewares to this function's chain, in this order. */
  use<const M extends readonly AnyMiddleware[]>(...mws: M): FnBuilder<A, C & AddsOf<M>>;
  /** Removes inherited middlewares, by identity. `'*'` removes every inherited one. */
  skip(...mws: readonly AnyMiddleware[]): FnBuilder<A, C>;
  skip(all: '*'): FnBuilder<A, C>;
  /** Declares the type of the arguments the client passes. */
  args<T>(): FnBuilder<T, C>;
  /** The client passes this form; the server validates a fresh copy of it. */
  form<F extends AnyForm>(form: F): FnBuilder<F, C & { readonly form: F }>;
  /** Concrete paths or route patterns whose cached data this call leaves stale. */
  invalidates(...paths: readonly string[]): FnBuilder<A, C>;
  /** Compresses the uploaded body. `false` turns off what it inherited. */
  compress(options: CompressOptions | false): FnBuilder<A, C>;
  /** Closes the builder. Without `.handle` there is no function. */
  handle<R>(fn: (ctx: ServerContext<A> & C) => R | Promise<R>): ServerFn<A, Awaited<R>>;
}

interface State {
  readonly method: Method;
  readonly level: Level;
  readonly form?: AnyForm;
  readonly invalidates: readonly string[];
}

/** One class for every `<A, C>`: the type parameters only exist for the editor. */
class Builder {
  constructor(private readonly state: State) {}

  private with(patch: Partial<State>): Builder {
    return new Builder({ ...this.state, ...patch });
  }

  use(...mws: readonly AnyMiddleware[]): Builder {
    return this.with({ level: withStep(this.state.level, { kind: 'use', mws }) });
  }

  skip(...mws: readonly (AnyMiddleware | '*')[]): Builder {
    return this.with({ level: withStep(this.state.level, skipStep(mws)) });
  }

  args(): Builder {
    return this;
  }

  form(form: AnyForm): Builder {
    return this.with({ form });
  }

  invalidates(...paths: readonly string[]): Builder {
    return this.with({ invalidates: [...this.state.invalidates, ...paths] });
  }

  compress(options: CompressOptions | false): Builder {
    return this.with({ level: { ...this.state.level, compression: options } });
  }

  handle(fn: (ctx: never) => unknown): ServerFn<unknown, unknown> {
    return { ...this.state, handle: fn as (ctx: ServerContext) => unknown };
  }
}

const verb =
  (method: Method) =>
  (): FnBuilder<void, {}> =>
    new Builder({ method, level: { steps: [] }, invalidates: [] }) as unknown as FnBuilder<void, {}>;

export const get = /*#__PURE__*/ verb('GET');
export const post = /*#__PURE__*/ verb('POST');
export const put = /*#__PURE__*/ verb('PUT');
export const patch = /*#__PURE__*/ verb('PATCH');
/** `delete` is a reserved word: it cannot be the binding of an import. */
export const del = /*#__PURE__*/ verb('DELETE');
