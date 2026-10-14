/**
 * Running one criterion: a fresh page, its steps in order, a verdict. No criterion inherits
 * another's state, and the measuring page never listens to Vite: a reload on save would land in
 * the middle of a criterion.
 */

import type { BlockKind, Layer, TermParam } from '@fudic/spec';
import { firstLine, type BrowserLike } from './browser.js';
import { createTermContext, type TermContext } from './context.js';
import type { PlannedCriterion } from './pages.js';
import type { StepResult, Verdict } from './protocol.js';
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
  /** Why the criterion could not run at all. */
  readonly error?: string;
}

/** The evidence of a step whose term asked to navigate. */
export const IGNORED_GOTO = 'ignored: the workbench mounts the component on its own page';

/** The workbench's own paths: the only WebSockets the measuring page may open. */
const BENCH_PATH = '/__bench';

/** Arguments by parameter name: a `number` parameter as a number, the rest as written. */
export function namedArgs(params: readonly TermParam[], args: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(
    params.map((param, i) => [param.name, param.type === 'number' ? Number(args[i]) : args[i]]),
  );
}

export async function runCriterion(
  browser: BrowserLike,
  origin: string,
  criterion: PlannedCriterion,
  loadTerm: TermLoader,
): Promise<CriterionResult> {
  const started = Date.now();
  const done = (verdict: Verdict, steps: readonly StepResult[], pageErrors: readonly string[], error?: string) => ({
    id: criterion.id,
    verdict,
    ms: Date.now() - started,
    steps,
    pageErrors,
    ...(error !== undefined ? { error } : {}),
  });
  if (criterion.error !== undefined) return done('error', [], [], criterion.error);

  const page = await browser.newPage();
  const pageErrors: string[] = [];
  const steps: StepResult[] = [];
  try {
    await page.silenceWebSockets((url) => !url.pathname.startsWith(BENCH_PATH));
    await page.addInitScript(OBSERVER);
    page.onPageError((message) => pageErrors.push(message));

    const status = await page.goto(origin + criterion.route);
    if (status === null || status >= 400) {
      return done('error', [], pageErrors, `the page ${criterion.route} answered ${status ?? 'nothing'}`);
    }

    let navigated = false;
    const ctx = createTermContext(page, () => {
      navigated = true;
    });
    let verdict: Verdict = 'pass';
    for (const step of criterion.steps) {
      const base = { block: step.block, term: step.term, args: step.args };
      let term: LoadedTerm | undefined;
      try {
        term = await loadTerm(step.block, step.term);
        navigated = false;
        const outcome = await term.run(ctx, namedArgs(term.params, step.args));
        const evidence = navigated ? IGNORED_GOTO : outcome.evidence;
        steps.push({ ...base, layer: term.layer, pass: outcome.pass, evidence });
        if (step.block === 'then' && !outcome.pass) verdict = 'fail';
      } catch (error) {
        steps.push({ ...base, layer: term?.layer ?? 'workspace', error: firstLine(error) });
        return done('error', steps, pageErrors);
      }
      if (pageErrors.length > 0) return done('error', steps, pageErrors);
    }
    // A criterion without steps still fails on an error the page logged while loading.
    return done(pageErrors.length > 0 ? 'error' : verdict, steps, pageErrors);
  } catch (error) {
    return done('error', steps, pageErrors, firstLine(error));
  } finally {
    await page.close();
  }
}
