/**
 * Running one criterion: a fresh page, its steps in order, a verdict, and what the browser saw —
 * the mounted element photographed before the first `when` and at the end, with the box of every
 * reference a step located. No criterion inherits another's state, and the measuring page never
 * listens to Vite: a reload on save would land in the middle of a criterion.
 */

import {
  FUD1200,
  FUD1201,
  FUD1202,
  FUD1203,
  FUD1204,
  FUD1205,
  FUD1206,
  FUD1207,
  FUD1508,
  FUD1514,
  type FudDiagnostic,
} from '@fudic/diagnostics';
import type { BenchCall, Recorded } from '@fudic/vite';
import type { BlockKind, Layer, TermParam } from '@fudic/spec';
import { CALL_TIMEOUT, firstLine, type BrowserLike, type LocatorLike, type PageLike, type PageScript } from './browser.js';
import { chainContext, ExtensionError, setUp, type LoadedExtension, type TermHost } from './extension.js';
import { AS, type PlannedCriterion, type PlannedStep } from './pages.js';
import type { Box, Mark, StepResult, Verdict } from './protocol.js';
import { LOOK, QUIET, Unsettled, waitQuiet, type QuietProbe } from './quiet.js';
import { OBSERVER, settled } from './settle.js';

/** What a term's `run` answers. */
export interface TermOutcome {
  readonly pass: boolean;
  readonly evidence: unknown;
}

/** A term module, executed. */
export interface LoadedTerm {
  /** The module, absolute. */
  readonly path: string;
  readonly layer: Layer;
  readonly params: readonly TermParam[];
  /** `meta.describe`, when the module has one. */
  readonly describe?: (args: Readonly<Record<string, unknown>>) => string;
  /**
   * `meta.negative`: a `then` that holds when something is NOT there (`hidden`, `count … 0`).
   * It is read once, on the quiet page; any other `then` is retried until it holds (SDD-82 §4.5).
   */
  readonly negative?: boolean | ((args: Readonly<Record<string, unknown>>) => boolean);
  /** `ctx` is what the extensions built: the workbench does not know its shape. */
  run(ctx: unknown, args: Readonly<Record<string, unknown>>): Promise<TermOutcome>;
}

export type TermLoader = (block: BlockKind, name: string) => Promise<LoadedTerm>;

/** What a `TermLoader` throws for a term neither the project nor `@fudic/terms` has. */
export class MissingTermError extends Error {
  constructor(
    readonly block: BlockKind,
    readonly term: string,
  ) {
    super(`there is no ${block} term "${term}"`);
  }
}

export interface CriterionResult {
  readonly id: string;
  readonly verdict: Verdict;
  readonly ms: number;
  readonly steps: readonly StepResult[];
  readonly pageErrors: readonly string[];
  /** What the measuring browser saw; none when the page did not load. */
  readonly shots: Shots;
  /** Where each located reference was, relative to the `after` shot. */
  readonly marks: readonly Mark[];
  /** Why the criterion could not run at all. */
  readonly error?: string;
  /** Every problem of the run, each with its code: empty when it reached a verdict cleanly. */
  readonly diagnostics: readonly FudDiagnostic[];
  /** A page's or a flow's: the calls it made, in order (SDD-82 §4.4). */
  readonly calls?: readonly BenchCall[];
  /** A criterion that records: what the real server answered it, in order (SDD-82 §3.9). */
  readonly recorded?: readonly Recorded[];
}

/** The workbench's own paths: the only WebSockets the measuring page may open. */
const BENCH_PATH = '/__bench';

/** Arguments by parameter name: a `number` parameter as a number, the rest as written. */
export function namedArgs(params: readonly TermParam[], args: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(
    params.map((param, i) => [param.name, param.type === 'number' ? Number(args[i]) : args[i]]),
  );
}

/** How a criterion ended, before its shots. */
interface Ending {
  readonly verdict: Verdict;
  readonly error?: string;
  /** Why it did not reach a verdict, when it did not. */
  readonly problem?: FudDiagnostic;
}

/** What a step that threw says, by why it threw. */
export function stepProblem(error: unknown, step: PlannedStep, file: string): FudDiagnostic {
  const at = { file, span: { start: step.offset, end: step.offset } };
  const reason = firstLine(error);
  if (error instanceof MissingTermError) return FUD1201({ ...at, term: step.term });
  if (error instanceof Error && error.name === 'TimeoutError') return FUD1202({ ...at, term: step.term, reason });
  if (isAmbiguous(error)) return FUD1203({ ...at, ref: error.ref, count: error.count });
  if (error instanceof Unsettled) return FUD1508({ ...at, ms: error.ms, pending: error.pending });
  return FUD1204({ ...at, term: step.term, reason });
}

/** The guard of `ctx.locate`, by its name: the project may load its own copy of `@fudic/terms`. */
function isAmbiguous(error: unknown): error is Error & { ref: string; count: number } {
  return (
    error instanceof Error &&
    error.name === 'AmbiguousReference' &&
    typeof (error as { ref?: unknown }).ref === 'string' &&
    typeof (error as { count?: unknown }).count === 'number'
  );
}

/** What stopped a criterion outside its steps: an extension, or anything else. */
function runProblem(error: unknown): FudDiagnostic {
  if (error instanceof ExtensionError) return FUD1206({ file: error.file, reason: error.reason });
  return FUD1207({ reason: firstLine(error) });
}

/** The cookie a page's or a flow's criterion carries: its id, `<run>-<n>.<slug>` (SDD-82 §3.8). */
export const BENCH_COOKIE = 'fudic-bench';

/** The first person of a criterion, and the one `as main` comes back to. */
export const MAIN = 'main';

/** What Playwright says when a script ran into a navigation. */
const NAVIGATING = /context was destroyed|navigat/iu;

/** How long a red positive `then` waits between two tries. */
const RETRY_MS = 50;

/** Each criterion of the app gets a cookie of its own, even the same one run twice. */
let started = 0;

/** Whether a `then` holds by what is NOT there: read once, never retried. */
function isNegative(term: LoadedTerm, args: Readonly<Record<string, unknown>>): boolean {
  return typeof term.negative === 'function' ? term.negative(args) : term.negative === true;
}

/** The `FUD1514` of each call the fixture answered with the wrong kind of value. */
function mismatches(calls: readonly BenchCall[], file: string): FudDiagnostic[] {
  return calls
    .filter((call) => call.mismatch === true)
    .map((call) => FUD1514({ file, fn: call.name, answered: 'the wrong kind of value', returns: 'another' }));
}

/** One person of a criterion: a page in a context of its own, and the ctx its terms see. */
interface Person {
  readonly page: PageLike;
  readonly ctx: unknown;
  /** Where its page stood when the last `when` block began (SDD-82 §3.7). */
  mark: WhenMark;
}

/** Where a page stood when a `when` block began: its counters, and the token of its document. */
interface WhenMark {
  readonly requests: number;
  readonly downloads: number;
  readonly token: string;
}

/** Where the token of the document a `when` block began on is kept. Only in the measuring instance. */
const DOCUMENT_TOKEN = '__fudicBenchDocument';

/** Leaves `token` on the document: a reload or a navigation takes it away. */
const PUT_TOKEN: PageScript = `(token) => { globalThis.${DOCUMENT_TOKEN} = token; }`;

/** The token the document holds; null when it holds none. */
const READ_TOKEN: PageScript = `() => globalThis.${DOCUMENT_TOKEN} ?? null`;

/** Playwright's clock of a page: what `clock` and `wait` drive. */
interface ClockLike {
  install(options: { time: number }): Promise<void>;
  pauseAt(time: number): Promise<void>;
  runFor(ms: number): Promise<void>;
}

/**
 * How long before `at` the clock is installed. Installed, Playwright's clock flows at real speed
 * until it is paused, and pausing at an instant it has already passed is "fast-forward to the
 * past": on a loaded machine the two calls can be that far apart. Installed earlier, the pause
 * always moves it forward — over a blank page, so no timer of the app runs on the way.
 */
export const CLOCK_LEAD = 60_000;

/**
 * Stands a person's browser at `at`, still: it moves only with `wait`, as the criterion's server
 * does. Called before the person's page opens anything.
 */
async function standAt(page: PageLike, at: number): Promise<void> {
  const clock: ClockLike = page.page.clock;
  await clock.install({ time: at - CLOCK_LEAD });
  await clock.pauseAt(at);
}

export async function runCriterion(
  browser: BrowserLike,
  origin: string,
  criterion: PlannedCriterion,
  loadTerm: TermLoader,
  extensions: readonly LoadedExtension[],
  signal?: AbortSignal,
): Promise<CriterionResult> {
  const startedAt = Date.now();
  const pageErrors: string[] = [];
  const steps: StepResult[] = [];
  const app = criterion.app;
  // A page or a flow is the app's own URL, on the app's own Vite, with its criterion's cookie.
  const id = app === undefined ? '' : `${app.run}-${++started}.${criterion.id}`;
  const done = (ending: Ending, shots: Shots = {}, marks: readonly Mark[] = []): CriterionResult => {
    // Read before the criterion ends: its log goes with it.
    const calls = app?.bench.calls(id);
    const recorded = app?.setup.record === true ? app.bench.recorded(id) : undefined;
    return {
      id: criterion.id,
      verdict: ending.verdict,
      ms: Date.now() - startedAt,
      steps,
      pageErrors,
      shots,
      marks,
      ...(ending.error !== undefined ? { error: ending.error } : {}),
      diagnostics: [
        ...(ending.problem !== undefined ? [ending.problem] : []),
        ...pageErrors.map((message) => FUD1205({ error: firstLine(message) })),
        ...mismatches(calls ?? [], criterion.spec),
      ],
      ...(calls !== undefined ? { calls } : {}),
      ...(recorded !== undefined ? { recorded } : {}),
    };
  };
  if (criterion.error !== undefined) {
    const problem = criterion.problem ?? FUD1207({ reason: criterion.error });
    return done({ verdict: 'error', error: criterion.error, problem });
  }

  const people = new Map<string, Person>();
  // A cancel closes every page under the run: whatever it was waiting on rejects, and it ends.
  const cancel = (): void => {
    for (const one of people.values()) void one.page.close();
  };
  signal?.addEventListener('abort', cancel, { once: true });
  /** A cancel that came while a page was opening has already fired: no listener hears it. */
  const closeIfCancelled = (): void => {
    if (signal?.aborted === true) cancel();
  };
  const located: Mark[] = [];
  let current = 0;
  /** Where the criterion opens: the app's page, or the component's generated one. */
  const start = (app?.origin ?? origin) + criterion.route;
  const specDir = criterion.spec.slice(0, criterion.spec.lastIndexOf('/'));
  /** The instant the criterion's clock was stood at, once a `clock` did (SDD-82 §4.6). */
  let clockAt: number | undefined;
  /** Every `when` block gets a token of its own: a document that keeps it was not reloaded. */
  let blocks = 0;

  /** Where `page` stands now, as a `when` block that begins now leaves it. */
  async function markOf(page: PageLike): Promise<WhenMark> {
    const token = `${id}#${++blocks}`;
    // A page on the browser's own error page, or between two documents, holds no token: that
    // is a document other than the next one, which is what the mark has to tell.
    await page.evaluate(PUT_TOKEN, token).catch(() => undefined);
    return { requests: page.requests(), downloads: page.downloads().length, token };
  }

  /** The quiet page of a person: its requests, its timers, its frames (§4.5). */
  const probe = (page: PageLike): QuietProbe => ({
    look: async () => {
      let inside: { timers: number; frames: number } | undefined;
      try {
        inside = await page.evaluate<{ timers: number; frames: number } | undefined>(LOOK);
      } catch (error) {
        // The document went away under the look: a navigation is on its way, and that is pending.
        if (!NAVIGATING.test(firstLine(error))) throw error;
        return { requests: [...page.pending(), 'a navigation'], timers: 0, frames: 0 };
      }
      // Under a clock the page's time moves only with `wait`: its timers and frames are not
      // pending on their own, and waiting for them would wait for ever (§4.6).
      if (clockAt !== undefined) return { requests: page.pending(), timers: 0, frames: 0 };
      return { requests: page.pending(), ...(inside ?? { timers: 0, frames: 0 }) };
    },
    held: () => app?.bench.held(id) ?? 0,
  });

  /**
   * Opens the criterion's URL in a person's page. Under a clock, the document may wait for it — a
   * `later` of its `load` — and never load on its own: it is opened once it answers, and read once
   * the page is quiet, which does not wait for what the clock holds (SDD-82 §4.6).
   */
  async function open(page: PageLike): Promise<number | null> {
    if (clockAt === undefined) return page.goto(start);
    const status = await page.goto(start, 'commit');
    await waitQuiet(probe(page), CALL_TIMEOUT);
    return status;
  }

  /** A person by name: the first time it is named, a page in a context of its own. */
  async function person(name: string, opened?: PageLike): Promise<Person> {
    const known = people.get(name);
    if (known !== undefined) return known;
    const page = opened ?? (await browser.newPage());
    const host: TermHost = {
      page: page.page,
      url: start,
      resolve: (path) => (/^(?:[a-zA-Z]:)?\//u.test(path) ? path : `${specDir}/${path.replace(/^\.\//u, '')}`),
      quiet: () => waitQuiet(probe(page), CALL_TIMEOUT),
      async clock(at, label) {
        clockAt = at;
        for (const one of people.values()) await standAt(one.page, at);
        app?.bench.setClock(id, at, label);
      },
      async advance(ms) {
        if (clockAt === undefined) {
          await new Promise((resolve) => setTimeout(resolve, ms));
          return;
        }
        for (const one of people.values()) await one.page.page.clock.runFor(ms);
        app?.bench.advance(id, ms);
      },
      calls: () => app?.bench.calls(id) ?? [],
      response: () => page.document(),
      lastWhen: () => {
        const mark = people.get(name)!.mark;
        return { requests: page.requests() - mark.requests, downloads: page.downloads().slice(mark.downloads) };
      },
      reloaded: async () => (await page.evaluate<string | null>(READ_TOKEN).catch(() => null)) !== people.get(name)!.mark.token,
      paths: () => app?.paths?.() ?? Promise.resolve(null),
      settle: (target, gesture) => settled(page, page.adopt(target), gesture),
      // A term may read a reference and then act on it: one mark per step and reference, the last.
      onLocate(ref, box, source) {
        const mark: Mark = { step: current, ref, box, ...(source !== null ? { source } : {}) };
        const same = located.findIndex((m) => m.step === current && m.ref === ref);
        if (same === -1) located.push(mark);
        else located[same] = mark;
      },
    };
    const made: Person = { page, ctx: undefined, mark: { requests: 0, downloads: 0, token: '' } };
    people.set(name, made);
    closeIfCancelled();
    await page.silenceWebSockets((url) => !url.pathname.startsWith(BENCH_PATH));
    await page.addInitScript(OBSERVER);
    await page.addInitScript(QUIET);
    page.onPageError((message) => pageErrors.push(message));
    if (app !== undefined) await page.addCookie(BENCH_COOKIE, id, app.origin);
    // One who comes after the clock stands where the criterion's clock stands now.
    if (clockAt !== undefined) await standAt(page, app?.bench.now(id) ?? clockAt);
    await setUp(extensions, page.page);
    const ready: Person = { page, ctx: chainContext(extensions, host), mark: made.mark };
    people.set(name, ready);
    return ready;
  }

  // A browser that cannot give a page is the run's problem, not this criterion's: it goes up.
  const first = await browser.newPage();
  app?.bench.begin(id, app.setup, app.names);
  try {
    // The first person is `main`: the page the criterion opens.
    let who = await person(MAIN, first);
    let verdict: Verdict = 'pass';
    /** Taken just before the first `when`: once, whatever it gave. */
    let before: Promise<Shot | undefined> | undefined;
    const mount = who.page.locate(criterion.mount);

    // `given` comes first and runs before anything is opened: a cookie, a locale, a clock are
    // there when the page loads (SDD-82 §3.7). Then every person named so far opens the URL.
    let index = 0;
    for (; index < criterion.steps.length && criterion.steps[index]!.block === 'given'; index++) {
      const stop = await runStep(index, criterion.steps[index]!);
      if (stop !== undefined) return await finish(stop);
    }
    for (const [name, one] of people) {
      const status = await open(one.page);
      // A page answers with its own error status, and a `then` reads it: only no answer at all stops it.
      if (name === MAIN && (status === null || (app === undefined && status >= 400))) {
        const error = `the page ${criterion.route} answered ${status ?? 'nothing'}`;
        return done({ verdict: 'error', error, problem: FUD1200({ route: criterion.route, status }) });
      }
    }

    for (; index < criterion.steps.length; index++) {
      const step = criterion.steps[index]!;
      // A `when` block begins: every page notes where it stands, for `requests`, `downloaded`
      // and `not-reloaded` (SDD-82 §3.7); and the first one is preceded by the `before` shot.
      if (step.block === 'when' && criterion.steps[index - 1]?.block !== 'when') {
        if (before === undefined) {
          before = shot(mount);
          await before;
        }
        for (const one of people.values()) one.mark = await markOf(one.page);
      }
      const stop = await runStep(index, step);
      if (stop !== undefined) return await finish(stop);
    }
    // A criterion without steps still fails on an error the page logged while loading.
    return await finish({ verdict: pageErrors.length > 0 ? 'error' : verdict });

    /** The shots of the criterion as it ends, and its result. */
    async function finish(ending: Ending): Promise<CriterionResult> {
      const shots = { before: await before, after: await shot(mount) };
      const kept: Shots = {
        ...(shots.before !== undefined ? { before: shots.before } : {}),
        ...(shots.after !== undefined ? { after: shots.after } : {}),
      };
      return done(ending, kept, shots.after === undefined ? [] : relative(located, shots.after.box));
    }

    /**
     * A `then` read on the quiet page. A document that goes away under it — a reload or a
     * navigation the page started on its own, after it looked quiet — is no answer: the page is
     * waited for again and read once more (§4.5). Any other error is the term's.
     */
    async function readThen(term: LoadedTerm, args: Readonly<Record<string, unknown>>): Promise<TermOutcome> {
      try {
        return await term.run(who.ctx, args);
      } catch (error) {
        if (!NAVIGATING.test(firstLine(error))) throw error;
        await waitQuiet(probe(who.page), CALL_TIMEOUT);
        return term.run(who.ctx, args);
      }
    }

    /** One step: what it found goes to `steps`; an ending when the criterion stops there. */
    async function runStep(at: number, step: PlannedStep): Promise<Ending | undefined> {
      current = at;
      const base = { block: step.block, term: step.term, args: step.args };
      let term: LoadedTerm | undefined;
      try {
        if (step.term === AS) {
          // What follows is done by another person, or by the first one again (SDD-82 §3.7). A
          // new one opens where the criterion opens, a browser of its own — once `given` is over.
          const name = step.args[0]!;
          const fresh = !people.has(name);
          who = await person(name);
          if (fresh && step.block !== 'given') {
            who.mark = await markOf(who.page);
            await open(who.page);
          }
          steps.push({ ...base, layer: 'framework', pass: true, evidence: `as ${name}` });
          return undefined;
        }
        term = await loadTerm(step.block, step.term);
        // Never on a page half loaded: a `then` reads the page once it is quiet (§4.5).
        if (step.block === 'then') await waitQuiet(probe(who.page), CALL_TIMEOUT);
        const args = namedArgs(term.params, step.args);
        const loaded = term;
        const read = (): Promise<TermOutcome> => (step.block === 'then' ? readThen(loaded, args) : loaded.run(who.ctx, args));
        let outcome = await read();
        // A positive `then` holds once what it waits for arrives: tried again until the time is up.
        const until = Date.now() + CALL_TIMEOUT;
        while (step.block === 'then' && !outcome.pass && !isNegative(term, args) && Date.now() < until) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
          outcome = await read();
        }
        if (step.block === 'when') await waitQuiet(probe(who.page), CALL_TIMEOUT);
        steps.push({ ...base, layer: term.layer, pass: outcome.pass, evidence: outcome.evidence });
        if (step.block === 'then' && !outcome.pass) verdict = 'fail';
      } catch (error) {
        const problem = stepProblem(error, step, criterion.spec);
        steps.push({ ...base, layer: term?.layer ?? 'workspace', error: firstLine(error), code: problem.code });
        return { verdict: 'error', problem };
      }
      return pageErrors.length > 0 ? { verdict: 'error' } : undefined;
    }
  } catch (error) {
    return done({ verdict: 'error', error: firstLine(error), problem: runProblem(error) });
  } finally {
    signal?.removeEventListener('abort', cancel);
    await Promise.all([...people.values()].map((one) => one.page.close()));
    app?.bench.end(id);
  }
}

/** A shot: the PNG and where the element was in the page when it was taken. */
export interface Shot {
  readonly png: Buffer;
  readonly box: Box;
}

export interface Shots {
  readonly before?: Shot;
  readonly after?: Shot;
}

/**
 * The mounted element, photographed; nothing when it has no box to photograph, or when the
 * photograph fails — a shot is evidence for the human, never a reason to change the verdict.
 */
async function shot(mount: LocatorLike): Promise<Shot | undefined> {
  try {
    const box = await mount.box();
    if (box === null || box.width === 0 || box.height === 0) return undefined;
    return { png: await mount.screenshot(), box };
  } catch {
    return undefined;
  }
}

/** Each located box, in the coordinates of the `after` shot. */
function relative(located: readonly Mark[], origin: Box): Mark[] {
  return located.map((mark) => ({
    ...mark,
    box: { x: mark.box.x - origin.x, y: mark.box.y - origin.y, width: mark.box.width, height: mark.box.height },
  }));
}
