/**
 * The workbench's hand on the server (SDD-82 §3.8, §4.2): when the bench runs a page or a flow,
 * it puts its hooks on `globalThis[Symbol.for('fudic.bench')]`, and each request that carries a
 * criterion's cookie is answered by them where the criterion's fixture says so — what `load`
 * returns, what a function or a remote rule answers, the services of its root container. What
 * the fixture does not name runs for real, and every call is logged.
 *
 * Read through a registered symbol, never imported: the server that answers may hold another
 * copy of this package, and the bench is not one of its dependencies. Only in dev: a build never
 * reads it, whatever cookie a request brings.
 *
 * The markers of a fixture (`fixture.ts`) become what they stand for here, where the classes of
 * the copy that answers are: a `Failed` an `HttpError`, a `Redirected` a `Redirect`, a `Later` a
 * promise on the criterion's clock. A `FileAnswer` is the bench's: it hands a `File` already.
 */

import { provideIn, type Container } from '@fudic/di';
import { HttpError, Redirect } from '../errors.js';
import { titleOf } from './fails.js';
import type { FailedStatus, ServiceOverride } from './fixture.js';

/** The key the hooks live under. */
export const BENCH_KEY: unique symbol = Symbol.for('fudic.bench') as never;

/** One call of a criterion, as the log keeps it (SDD-82 §4.4). */
export interface BenchCall {
  /** The `<id>` of its `.fudapi`. */
  readonly id: string;
  /** The function's or the remote rule's name. */
  readonly name: string;
  /** Its arguments, decoded: the route's, the query's and the body's in one object. */
  readonly args: Readonly<Record<string, unknown>>;
  /** Answered by the fixture, without running the handler. */
  readonly faked: boolean;
  /** The status it answered with; `0` for a network failure. */
  readonly status: number;
  /** The fixture answered a file to a function without `-> file`, or a value to one with it. */
  readonly mismatch?: boolean;
}

/** What the bench answers with: present, even when what it holds is `undefined` (a `void`). */
export interface Held {
  readonly value: unknown;
}

/** What the server asks the bench, by criterion. */
export interface BenchHooks {
  /** The criterion a request belongs to: from its cookie. */
  criterionOf(request: Request): string | undefined;
  /** The data of the next data request of the criterion for the route `<id>`; absent runs `load`. */
  data(criterion: string, route: string): Held | undefined;
  /** The answer of a call or a remote rule by its name; absent runs it. */
  answer(criterion: string, name: string, args: Readonly<Record<string, unknown>>): Held | undefined;
  /** A call is done, answered or not. */
  called(criterion: string, call: BenchCall): void;
  /** The criterion's services, put into the request's root container. */
  services(criterion: string): readonly ServiceOverride[];
  /** The criterion's clock, for the server's `Date`; `undefined` is the real one. */
  now(criterion: string): number | undefined;
  /** Resolves `ms` milliseconds later on the criterion's clock. */
  after(criterion: string, ms: number): Promise<void>;
}

/** The hooks and the criterion of one request. */
export interface Bench {
  readonly hooks: BenchHooks;
  readonly criterion: string;
}

/** The hooks installed in this process, if any. */
export const benchHooks = (): BenchHooks | undefined => (globalThis as { [BENCH_KEY]?: BenchHooks })[BENCH_KEY];

/**
 * Whether a server may read the bench at all: in dev, or in the workbench's own build — the one
 * it makes for its criteria without network (SDD-82 §4.7), which never leaves the bench's folder.
 */
export const benchAllowed = (options: { readonly dev?: boolean; readonly bench?: boolean }): boolean =>
  options.dev === true || options.bench === true;

/**
 * The bench of `request` when the server may read it (`allowed`), hooks are installed and the
 * request carries a criterion.
 */
export function benchOf(request: Request | undefined, allowed: boolean): Bench | undefined {
  const hooks = allowed ? benchHooks() : undefined;
  if (hooks === undefined || request === undefined) return undefined;
  const criterion = hooks.criterionOf(request);
  return criterion === undefined ? undefined : { hooks, criterion };
}

/** `root` with the criterion's services in it: what a request of the criterion resolves from. */
export function benchRoot<C extends Container>(root: C, request: Request | undefined, allowed = true): C {
  const bench = benchOf(request, allowed);
  if (bench !== undefined) for (const { provide, use } of bench.hooks.services(bench.criterion)) provideIn(root, provide, use);
  return root;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** The status failure of a fixture, as the error the copy that answers throws. */
const failure = ({ status, title }: FailedStatus): HttpError => new HttpError({ status, title });

/**
 * A `Failed` as its error: by status, or by one of the codes the function declares (`codes`,
 * its status and its detail). A code it does not declare is a fault of the fixture: a 500.
 */
export function failedError(marker: unknown, codes: Readonly<Record<string, readonly [number, string?]>> = {}): HttpError {
  const failed = marker as { readonly status?: number; readonly title?: string; readonly code?: string };
  if (failed.code === undefined) return failure(failed as FailedStatus);
  const declared = codes[failed.code];
  if (declared === undefined) {
    return new HttpError({ status: 500, title: titleOf(500), detail: `the fixture fails with "${failed.code}", which the function does not declare` });
  }
  const [status, detail] = declared;
  return new HttpError({ status, title: titleOf(status), code: failed.code, ...(detail !== undefined ? { detail } : {}) });
}

/** A network failure: the request never gets a response (`fails(0, …)`). */
export const isNetworkFailure = (value: unknown): boolean =>
  isObject(value) && isObject(value['$fails']) && value['$fails']['status'] === 0;

/** A promise that never settles, released when `signal` aborts: `later.never()`. */
function never(signal: AbortSignal | undefined): Promise<never> {
  return new Promise((_, reject) => {
    signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
}

/**
 * A fixture's answer, as the value it stands for: a `Later` waits on the criterion's clock and
 * stands for what it holds; a `Failed` throws its error and a `Redirected` its redirect. Anything
 * else is the value itself.
 */
export async function settleAnswer(
  bench: Bench,
  value: unknown,
  codes?: Readonly<Record<string, readonly [number, string?]>>,
  signal?: AbortSignal,
): Promise<unknown> {
  const now = await waited(bench, value, signal);
  if (!isObject(now)) return now;
  if ('$fails' in now) throw failedError(now['$fails'], codes);
  if ('$redirects' in now) {
    throw new Redirect({ status: now['status'] as number, title: titleOf(now['status'] as number), location: now['$redirects'] as string });
  }
  return now;
}

/** What a `Later` holds once the criterion's clock gets there; anything else, as it is. */
async function waited(bench: Bench, value: unknown, signal: AbortSignal | undefined): Promise<unknown> {
  if (!isObject(value) || !('$later' in value)) return value;
  if (value['$later'] === 'never') return never(signal);
  await bench.hooks.after(bench.criterion, value['$later'] as number);
  if ('fails' in value) throw failure(value['fails'] as FailedStatus);
  return waited(bench, value['value'], signal);
}

/**
 * A fixture's answer to a remote rule, as its verdict: `fails('code')` is the code that failed,
 * any other value passes. A failure by status or a redirect is the question's error.
 */
export async function settleVerdict(bench: Bench, value: unknown, signal?: AbortSignal): Promise<string | null> {
  const now = await waited(bench, value, signal);
  if (isObject(now) && isObject(now['$fails']) && typeof now['$fails']['code'] === 'string') return now['$fails']['code'];
  await settleAnswer(bench, now);
  return null;
}

/**
 * The `data` of a fixture for a `load`: its own failure or redirect thrown, and each field marked
 * `later` a promise of what it holds. A `later` field the fixture writes plainly is a promise too:
 * the page awaits it all the same.
 */
export async function settleData(bench: Bench, held: unknown, later: readonly string[]): Promise<unknown> {
  const data = await settleAnswer(bench, held);
  if (!isObject(data) || later.length === 0) return data;
  const out: Record<string, unknown> = { ...data };
  for (const name of later) out[name] = settleAnswer(bench, data[name]);
  return out;
}
