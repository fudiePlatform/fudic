/**
 * The workbench's hooks (SDD-82 §3.8, §4.2–§4.4): what the bench installs on
 * `globalThis[Symbol.for('fudic.bench')]` before it starts the app's Vite, and what the server
 * of that Vite asks of each request that carries a criterion's cookie.
 *
 * Each criterion is begun with its fixture already chosen — the `data` of its page in order, the
 * answers of its `answers` lines merged, its services, its clock — and ended when it is done.
 * Between the two, the hooks hand out what the fixture says and log every call, answered by the
 * fixture or not. The criterion travels in the cookie `fudic-bench=<run>.<criterion>`.
 *
 * The clock: a criterion begun with one stands still at that instant until `advance` moves it,
 * and the `later` of its fixture fire as it passes them. The server's `Date` reads it: dev wraps
 * each request in the criterion's scope (`benchScope`), and `Date` asks whose request it is.
 *
 * The types are written here by shape, as `@fudic/http` reads them: the bench is not one of its
 * dependencies, and it is not one of this package's.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

/** The cookie that carries the criterion. */
export const BENCH_COOKIE = 'fudic-bench';

/** The key the hooks live under. */
export const BENCH_KEY: unique symbol = Symbol.for('fudic.bench') as never;

/** One service in place of the real one. */
export interface ServiceOverride {
  readonly provide: unknown;
  readonly use: () => unknown;
}

/** One call of a criterion, as the log keeps it (§4.4). */
export interface BenchCall {
  readonly id: string;
  readonly name: string;
  /** Decoded; a file by its name. */
  readonly args: Readonly<Record<string, unknown>>;
  readonly faked: boolean;
  /** `0`: a network failure. */
  readonly status: number;
  readonly mismatch?: boolean;
}

/** What the bench answers with, even when it is `undefined` (a `void`). */
export interface Held {
  readonly value: unknown;
}

/** What the server asks the bench (§3.8). */
export interface BenchHooks {
  criterionOf(request: Request): string | undefined;
  data(criterion: string, route: string): Held | undefined;
  answer(criterion: string, name: string, args: Readonly<Record<string, unknown>>): Held | undefined;
  called(criterion: string, call: BenchCall): void;
  services(criterion: string): readonly ServiceOverride[];
  now(criterion: string): number | undefined;
  after(criterion: string, ms: number): Promise<void>;
  record?(criterion: string, entry: Recorded): void;
}

/** One real answer of the server, for `record` (SDD-82 §3.9): a marker or a value, a `File` as it is. */
export type Recorded =
  | { readonly kind: 'data'; readonly route: string; readonly value: Promise<unknown> }
  | { readonly kind: 'call'; readonly name: string; readonly value: unknown };

/** What a criterion runs with: the fixture lines of its `given`, resolved. */
export interface CriterionSetup {
  /** The `<id>` of the page's route (`routes/usuarios`), which `data` is for. */
  readonly route?: string;
  /** What `load` returns, in order; the last one repeats (`data a b`). */
  readonly data?: readonly unknown[];
  /** The answers of its `answers` groups, merged: the last one that names a function wins. */
  readonly answers?: Readonly<Record<string, unknown>>;
  /** Its services; each `use` is called once for the whole criterion. */
  readonly services?: readonly ServiceOverride[];
  /** Its clock: the instant it stands at, in ms since the epoch (`clock`). */
  readonly clock?: number;
  /** Where the fixture is: what a `file(…)` path is relative to. */
  readonly dir?: string;
  /** It records (SDD-82 §3.9): what the real server answers is kept, for `recorded`. */
  readonly record?: boolean;
}

/** The names of what a criterion runs with: what a backend that is not fudic's asks (§3.8). */
export interface CriterionNames {
  readonly services?: string;
  readonly answers?: readonly string[];
  readonly clock?: string;
}

/** The hooks, and what the bench drives them with. */
export interface Bench extends BenchHooks {
  /** A criterion starts, with its setup and the names of its fixture lines. */
  begin(criterion: string, setup: CriterionSetup, names?: CriterionNames): void;
  /** It is done: its state goes. */
  end(criterion: string): void;
  /** Its calls so far, in order. */
  calls(criterion: string): readonly BenchCall[];
  /** Move its clock `ms` forward, firing what falls due. */
  advance(criterion: string, ms: number): void;
  /**
   * Stand its clock at `at` (ms since the epoch), as `clock <label>` of its `given` says: from now
   * on the server's `Date` and its `later` read it, and a backend asking learns its name.
   */
  setClock(criterion: string, at: number, label: string): void;
  /** The names it runs with, or `undefined` for a criterion that is not running. */
  names(criterion: string): CriterionNames | undefined;
  /**
   * How many answers it holds that will not arrive on their own, each one a request the page
   * waits on: those that never arrive (`later.never()`), and those that wait for its clock to be
   * moved (`later` under `clock`). The quiet page does not wait for them (SDD-82 §4.5, §4.6).
   */
  held(criterion: string): number;
  /** What the real server answered it so far, in order, when it was begun to record. */
  recorded(criterion: string): readonly Recorded[];
}

/** A `later` waiting on a criterion's clock. */
interface Timer {
  readonly at: number;
  readonly fire: () => void;
}

interface Running {
  readonly setup: CriterionSetup;
  names: CriterionNames;
  readonly services: readonly ServiceOverride[];
  readonly calls: BenchCall[];
  readonly recorded: Recorded[];
  /** Data requests so far, by route. */
  readonly asked: Map<string, number>;
  now: number | undefined;
  timers: Timer[];
  held: number;
}

/** Whether a value holds a `later.never()` anywhere. */
function holdsForever(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(holdsForever);
  if (!isObject(value)) return false;
  return value['$later'] === 'never' || Object.values(value).some(holdsForever);
}

/** What the fixture hands out, counted when it never arrives. */
function handOut(state: Running, value: unknown): Held {
  if (holdsForever(value)) state.held++;
  return { value: withFiles(value, state.setup.dir ?? '.') };
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** Every `file(…)` in `value` as the `File` it names, read beside the fixture. */
function withFiles(value: unknown, dir: string): unknown {
  if (Array.isArray(value)) return value.map((item) => withFiles(item, dir));
  if (!isObject(value)) return value;
  if (typeof value['$file'] === 'string') {
    const path = resolve(dir, value['$file']);
    const name = typeof value['name'] === 'string' ? value['name'] : basename(path);
    return new File([readFileSync(path)], name, typeof value['type'] === 'string' ? { type: value['type'] } : {});
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, withFiles(item, dir)]));
}

/** What the log keeps of an argument: a file by its name. */
function logged(value: unknown): unknown {
  if (value instanceof File) return value.name;
  if (Array.isArray(value)) return value.map(logged);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, logged(item)]));
}

/** The value of the cookie `name` in a `Cookie` header. */
export function cookieOf(header: string | null, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at > 0 && part.slice(0, at).trim() === name) return decodeURIComponent(part.slice(at + 1).trim());
  }
  return undefined;
}

/** A bench with no criterion running yet. */
export function createBench(): Bench {
  const running = new Map<string, Running>();
  const of = (criterion: string): Running | undefined => running.get(criterion);
  const fire = (state: Running): void => {
    const due = state.timers.filter((t) => t.at <= state.now!);
    state.timers = state.timers.filter((t) => t.at > state.now!);
    for (const timer of due.sort((a, b) => a.at - b.at)) timer.fire();
  };
  return {
    criterionOf: (request) => {
      const id = cookieOf(request.headers.get('cookie'), BENCH_COOKIE);
      return id !== undefined && running.has(id) ? id : undefined;
    },
    data: (criterion, route) => {
      const state = of(criterion);
      const list = state?.setup.data;
      if (state === undefined || list === undefined || list.length === 0 || state.setup.route !== route) return undefined;
      const nth = state.asked.get(route) ?? 0;
      state.asked.set(route, nth + 1);
      return handOut(state, list[Math.min(nth, list.length - 1)]);
    },
    answer: (criterion, name) => {
      const state = of(criterion);
      const answers = state?.setup.answers;
      if (answers === undefined || !Object.hasOwn(answers, name)) return undefined;
      return handOut(state!, answers[name]);
    },
    called: (criterion, call) => {
      of(criterion)?.calls.push({ ...call, args: logged(call.args) as Readonly<Record<string, unknown>> });
    },
    record: (criterion, entry) => {
      const state = of(criterion);
      if (state?.setup.record === true) state.recorded.push(entry);
    },
    recorded: (criterion) => of(criterion)?.recorded ?? [],
    services: (criterion) => of(criterion)?.services ?? [],
    now: (criterion) => of(criterion)?.now,
    after: (criterion, ms) => {
      const state = of(criterion);
      if (state?.now === undefined) return new Promise((done) => setTimeout(done, ms));
      return new Promise((done) => {
        state.timers.push({ at: state.now! + ms, fire: done });
        fire(state);
      });
    },
    begin: (criterion, setup, names = {}) => {
      // One instance per service for the whole criterion: what one page creates, the next sees.
      const services = (setup.services ?? []).map(({ provide, use }) => {
        let made: { readonly value: unknown } | undefined;
        return { provide, use: () => (made ??= { value: use() }).value };
      });
      running.set(criterion, { setup, names, services, calls: [], recorded: [], asked: new Map(), now: setup.clock, timers: [], held: 0 });
    },
    end: (criterion) => {
      running.delete(criterion);
    },
    calls: (criterion) => of(criterion)?.calls ?? [],
    advance: (criterion, ms) => {
      const state = of(criterion);
      if (state?.now === undefined) return;
      state.now += ms;
      fire(state);
    },
    setClock: (criterion, at, label) => {
      const state = of(criterion);
      if (state === undefined) return;
      state.now = at;
      state.names = { ...state.names, clock: label };
      fire(state);
    },
    names: (criterion) => of(criterion)?.names,
    held: (criterion) => {
      const state = of(criterion);
      return state === undefined ? 0 : state.held + state.timers.length;
    },
  };
}

/** The hooks installed in this process, if any. */
export const installedBench = (): BenchHooks | undefined => (globalThis as { [BENCH_KEY]?: BenchHooks })[BENCH_KEY];

/**
 * Whose request this code runs for: the criterion of dev's request, when it carries one. Kept on
 * `globalThis`: the plugin that opens the scope may be another copy of this package than the
 * bench that patched `Date`, and both must read the same one.
 */
const SCOPE = Symbol.for('fudic.bench.scope');
const scope: AsyncLocalStorage<string> = ((globalThis as { [SCOPE]?: AsyncLocalStorage<string> })[SCOPE] ??= new AsyncLocalStorage<string>());

/** Runs `fn` as part of a request of `criterion`: the server's `Date` reads its clock. */
export function benchScope<T>(criterion: string | undefined, fn: () => T): T {
  return criterion === undefined ? fn() : scope.run(criterion, fn);
}

const RealDate = Date;

/** The instant of the criterion this code runs for, when it has a clock. */
function benchNow(): number | undefined {
  const criterion = scope.getStore();
  return criterion === undefined ? undefined : installedBench()?.now(criterion);
}

/**
 * `Date` as the criterion of the running request sees it: `new Date()`, `Date()` and
 * `Date.now()` read its clock; everything else is the real one. Outside a criterion with a
 * clock, it IS the real one.
 */
const BenchDate = new Proxy(RealDate, {
  construct(target, args: unknown[], newTarget) {
    const now = args.length === 0 ? benchNow() : undefined;
    return Reflect.construct(target, now === undefined ? args : [now], newTarget) as object;
  },
  apply(target) {
    const now = benchNow();
    return now === undefined ? target() : new RealDate(now).toString();
  },
  get(target, key, receiver) {
    if (key === 'now') return () => benchNow() ?? RealDate.now();
    return Reflect.get(target, key, receiver) as unknown;
  },
});

/** Put `bench` where the server reads it, with the server's `Date` on its clocks; undone by what it returns. */
export function installBench(bench: BenchHooks): () => void {
  const global = globalThis as { [BENCH_KEY]?: BenchHooks; Date: DateConstructor };
  global[BENCH_KEY] = bench;
  global.Date = BenchDate;
  return () => {
    delete global[BENCH_KEY];
    global.Date = RealDate;
  };
}

/** The criterion of a request, when the bench is installed and the request carries one. */
export function criterionOfRequest(cookie: string | undefined): string | undefined {
  const hooks = installedBench();
  return hooks === undefined ? undefined : hooks.criterionOf(new Request('http://bench/', { headers: cookie === undefined ? {} : { cookie } }));
}
