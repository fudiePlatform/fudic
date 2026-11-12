/**
 * The values a route's fixture holds, as the `.d.ts` of the route types them and the workbench
 * reads them. Each is data, never a promise: the fixture is read by the editor without running
 * it, serialized to the workbench, and the server turns each marker into what it stands for — a
 * value that arrives late, a failure, a redirect, a file. Types only: nothing here reaches a
 * browser.
 */

import type { Provider } from '@fudic/di';

/** A failure with its HTTP status and title. `0` is a network failure: no response at all. */
export interface FailedStatus {
  readonly status: number;
  readonly title: string;
}

/** A failure by one of the codes the function's `fails` declares. */
export interface FailedCode<C extends string> {
  readonly code: C;
}

/** The call or the `load` fails, with a status or with a declared code. */
export interface Failed<C extends string = never> {
  readonly $fails: FailedStatus | FailedCode<C>;
}

/** The answer is a redirect. */
export interface Redirected {
  readonly $redirects: string;
  readonly status: number;
}

/** A file beside the fixture, as the answer of a `-> file` function. */
export interface FileAnswer {
  /** Relative to the fixture file. */
  readonly $file: string;
  readonly type?: string;
  readonly name?: string;
}

/** The value after `ms` milliseconds of the criterion's clock, never, or a failure after `ms`. */
export type Later<T> =
  | { readonly $later: number; readonly value: T }
  | { readonly $later: 'never' }
  | { readonly $later: number; readonly fails: FailedStatus };

/** Each field that is a promise — a `later` of the `load` — as its value, now or later. */
export type FixtureOf<T> = { readonly [K in keyof T]: T[K] extends Promise<infer U> ? U | Later<U> : T[K] };

/** How a fixture answers a function or a remote rule: its value, later, a failure, or a redirect. */
export type Answer<R, C extends string = never> = R | Later<R> | Failed<C> | Redirected;

/** One service in place of the real one: what is asked for, and what answers it. */
export interface ServiceOverride<T = unknown> {
  readonly provide: Provider<T>;
  readonly use: () => T;
}
