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
import type { BenchCall } from '@fudic/vite';
import type { BlockKind, Layer, TermParam } from '@fudic/spec';
import { CALL_TIMEOUT, firstLine, type BrowserLike, type LocatorLike, type PageLike } from './browser.js';
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

  /** A person by name: the first time it is named, a page in a context of its own. */
  async function person(name: string, opened?: PageLike): Promise<Person> {
    const known = people.get(name);
    if (known !== undefined) return known;
    const page = opened ?? (await browser.newPage());
    const host: TermHost = {
      page: page.page,
      settle: (target, gesture) => settled(page, page.adopt(target), gesture),
      // A term may read a reference and then act on it: one mark per step and reference, the last.
      onLocate(ref, box, source) {
        const mark: Mark = { step: current, ref, box, ...(source !== null ? { source } : {}) };
        const same = located.findIndex((m) => m.step === current && m.ref === ref);
        if (same === -1) located.push(mark);
        else located[same] = mark;
      },
    };
    const made: Person = { page, ctx: undefined };
    people.set(name, made);
    closeIfCancelled();
    await page.silenceWebSockets((url) => !url.pathname.startsWith(BENCH_PATH));
    await page.addInitScript(OBSERVER);
    await page.addInitScript(QUIET);
    page.onPageError((message) => pageErrors.push(message));
    if (app !== undefined) await page.addCookie(BENCH_COOKIE, id, app.origin);
    await setUp(extensions, page.page);
    const ready: Person = { page, ctx: chainContext(extensions, host) };
    people.set(name, ready);
    return ready;
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
      return { requests: page.pending(), ...(inside ?? { timers: 0, frames: 0 }) };
    },
    held: () => app?.bench.held(id) ?? 0,
  });

  // A browser that cannot give a page is the run's problem, not this criterion's: it goes up.
  const first = await browser.newPage();
  app?.bench.begin(id, app.setup, app.names);
  try {
    // The first person is `main`: the page the criterion opens.
    const main = await person(MAIN, first);
    const start = (app?.origin ?? origin) + criterion.route;
    const status = await main.page.goto(start);
    // A page answers with its own error status, and a `then` reads it: only no answer at all stops it.
    if (status === null || (app === undefined && status >= 400)) {
      const error = `the page ${criterion.route} answered ${status ?? 'nothing'}`;
      return done({ verdict: 'error', error, problem: FUD1200({ route: criterion.route, status }) });
    }

    const mount = main.page.locate(criterion.mount);
    /** Taken just before the first `when`: once, whatever it gave. */
    let before: Promise<Shot | undefined> | undefined;
    let who = main;
    const ending = await runSteps();
    const shots = { before: await before, after: await shot(mount) };
    const kept: Shots = {
      ...(shots.before !== undefined ? { before: shots.before } : {}),
      ...(shots.after !== undefined ? { after: shots.after } : {}),
    };
    return done(ending, kept, shots.after === undefined ? [] : relative(located, shots.after.box));

    async function runSteps(): Promise<Ending> {
      let verdict: Verdict = 'pass';
      for (const [index, step] of criterion.steps.entries()) {
        current = index;
        if (step.block === 'when' && before === undefined) {
          before = shot(mount);
          await before;
        }
        const base = { block: step.block, term: step.term, args: step.args };
        let term: LoadedTerm | undefined;
        try {
          if (step.term === AS) {
            // What follows is done by another person, or by the first one again (SDD-82 §3.7). A
            // new one starts where the criterion starts: a browser of its own, on the same URL.
            const fresh = !people.has(step.args[0]!);
            who = await person(step.args[0]!);
            if (fresh) await who.page.goto(start);
            steps.push({ ...base, layer: 'framework', pass: true, evidence: `as ${step.args[0]!}` });
            continue;
          }
          term = await loadTerm(step.block, step.term);
          // Never on a page half loaded: a `then` reads the page once it is quiet (§4.5).
          if (step.block === 'then') await waitQuiet(probe(who.page), CALL_TIMEOUT);
          const args = namedArgs(term.params, step.args);
          let outcome = await term.run(who.ctx, args);
          // A positive `then` holds once what it waits for arrives: tried again until the time is up.
          const until = Date.now() + CALL_TIMEOUT;
          while (step.block === 'then' && !outcome.pass && !isNegative(term, args) && Date.now() < until) {
            await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
            outcome = await term.run(who.ctx, args);
          }
          if (step.block === 'when') await waitQuiet(probe(who.page), CALL_TIMEOUT);
          steps.push({ ...base, layer: term.layer, pass: outcome.pass, evidence: outcome.evidence });
          if (step.block === 'then' && !outcome.pass) verdict = 'fail';
        } catch (error) {
          const problem = stepProblem(error, step, criterion.spec);
          steps.push({ ...base, layer: term?.layer ?? 'workspace', error: firstLine(error), code: problem.code });
          return { verdict: 'error', problem };
        }
        if (pageErrors.length > 0) return { verdict: 'error' };
      }
      // A criterion without steps still fails on an error the page logged while loading.
      return { verdict: pageErrors.length > 0 ? 'error' : verdict };
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
