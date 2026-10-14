/**
 * Running one criterion: a fresh page, its steps in order, a verdict, and what the browser saw —
 * the mounted element photographed before the first `when` and at the end, with the box of every
 * reference a step located. No criterion inherits another's state, and the measuring page never
 * listens to Vite: a reload on save would land in the middle of a criterion.
 */

import type { BlockKind, Layer, TermParam } from '@fudic/spec';
import { firstLine, type BrowserLike, type LocatorLike } from './browser.js';
import { createTermContext, type TermContext } from './context.js';
import type { PlannedCriterion } from './pages.js';
import type { Box, Mark, StepResult, Verdict } from './protocol.js';
import { OBSERVER } from './settle.js';

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
  run(ctx: TermContext, args: Readonly<Record<string, unknown>>): Promise<TermOutcome>;
}

export type TermLoader = (block: BlockKind, name: string) => Promise<LoadedTerm>;

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
}

export async function runCriterion(
  browser: BrowserLike,
  origin: string,
  criterion: PlannedCriterion,
  loadTerm: TermLoader,
  signal?: AbortSignal,
): Promise<CriterionResult> {
  const started = Date.now();
  const pageErrors: string[] = [];
  const steps: StepResult[] = [];
  const done = (ending: Ending, shots: Shots = {}, marks: readonly Mark[] = []): CriterionResult => ({
    id: criterion.id,
    verdict: ending.verdict,
    ms: Date.now() - started,
    steps,
    pageErrors,
    shots,
    marks,
    ...(ending.error !== undefined ? { error: ending.error } : {}),
  });
  if (criterion.error !== undefined) return done({ verdict: 'error', error: criterion.error });

  const page = await browser.newPage();
  // A cancel closes the page under the run: whatever it was waiting on rejects, and it ends.
  const cancel = () => void page.close();
  signal?.addEventListener('abort', cancel, { once: true });
  // A cancel that came while the page was opening has already fired: no listener hears it.
  if (signal?.aborted === true) cancel();
  try {
    await page.silenceWebSockets((url) => !url.pathname.startsWith(BENCH_PATH));
    await page.addInitScript(OBSERVER);
    page.onPageError((message) => pageErrors.push(message));

    const status = await page.goto(origin + criterion.route);
    if (status === null || status >= 400) {
      return done({ verdict: 'error', error: `the page ${criterion.route} answered ${status ?? 'nothing'}` });
    }

    const mount = page.locate({ css: criterion.mount });
    const located: { step: number; ref: string; box: Box }[] = [];
    let current = 0;
    let navigated = false;
    const ctx = createTermContext(
      page,
      () => {
        navigated = true;
      },
      (ref, box) => located.push({ step: current, ref, box }),
    );
    /** Taken just before the first `when`: once, whatever it gave. */
    let before: Promise<Shot | undefined> | undefined;
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
          term = await loadTerm(step.block, step.term);
          navigated = false;
          const outcome = await term.run(ctx, namedArgs(term.params, step.args));
          if (navigated) steps.push({ ...base, layer: term.layer, pass: outcome.pass, evidence: null, ignored: true });
          else steps.push({ ...base, layer: term.layer, pass: outcome.pass, evidence: outcome.evidence });
          if (step.block === 'then' && !outcome.pass) verdict = 'fail';
        } catch (error) {
          steps.push({ ...base, layer: term?.layer ?? 'workspace', error: firstLine(error) });
          return { verdict: 'error' };
        }
        if (pageErrors.length > 0) return { verdict: 'error' };
      }
      // A criterion without steps still fails on an error the page logged while loading.
      return { verdict: pageErrors.length > 0 ? 'error' : verdict };
    }
  } catch (error) {
    return done({ verdict: 'error', error: firstLine(error) });
  } finally {
    signal?.removeEventListener('abort', cancel);
    await page.close();
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
    step: mark.step,
    ref: mark.ref,
    box: { x: mark.box.x - origin.x, y: mark.box.y - origin.y, width: mark.box.width, height: mark.box.height },
  }));
}
