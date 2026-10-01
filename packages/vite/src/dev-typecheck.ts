/**
 * The typecheck of `vite dev` (SDD-35 §4.5): a project checker kept alive for the life of the
 * server, so what the editor marks is what the browser refuses to show.
 *
 *   - At start it checks the whole project and prints what it finds.
 *   - When a file the program read changes — or a `.fud` appears or goes away — it re-checks.
 *     The checker keeps its language service, so TypeScript only redoes what changed.
 *   - An error goes to the terminal in full and to Vite's overlay, without a reload, even when
 *     it is in a component the open page uses and not in the page.
 *   - Going from errors to clean sends a full reload, and the page comes back by itself.
 *
 * The page itself is blocked by the HTML middleware, which asks `blocking` before rendering.
 */

import { readFileSync } from 'node:fs';
import type { ErrorPayload, ViteDevServer } from 'vite';
import {
  createProjectChecker,
  locateProblem,
  toPosix,
  type CheckProblem,
  type CheckReport,
  type ProjectChecker,
  type ProjectProblem,
} from '@fudic/typecheck';
import { summarize } from './typecheck.js';

/** What Vite's overlay takes, and what `next(err)` hands its error middleware. */
export type OverlayError = ErrorPayload['err'];

export interface LiveCheck {
  /** The latest report, after waiting for a check that is in flight. */
  current(): Promise<CheckReport>;
  /**
   * The first error that blocks a page whose graph is these files, or `undefined`. A check
   * that could not run blocks every page: nothing was verified.
   */
  blocking(files: readonly string[]): Promise<OverlayError | undefined>;
  /** Stop watching. */
  dispose(): void;
}

/** A burst of saves is one check, not one per file. */
const SETTLE_MS = 30;

/** Start the live check of a dev server. */
export function startLiveCheck(
  server: ViteDevServer,
  root: string,
  checker: ProjectChecker = createProjectChecker({ root }),
): LiveCheck {
  const logger = server.config.logger;
  let report: CheckReport = { problems: [], project: [], inputs: [] };
  let inputs = new Set<string>();
  let running: Promise<CheckReport> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let release: ((value: CheckReport) => void) | undefined;
  let hadErrors = false;

  const run = (): void => {
    timer = undefined;
    report = checker.check();
    inputs = new Set(report.inputs.map(keyOf));

    const summary = summarize(report, root);
    for (const block of summary.blocks) {
      if (block.severity === 'error') logger.error(block.text);
      else logger.warn(block.text);
    }
    // A report with a first error is a report that fails, so the summary has its line.
    if (summary.failure !== undefined) logger.error(summary.failure);
    const first = firstError(report);
    if (first !== undefined) {
      server.ws.send({ type: 'error', err: first });
    } else if (hadErrors) {
      logger.info('fudic: the typecheck is clean again');
      server.ws.send({ type: 'full-reload' });
    }
    hadErrors = first !== undefined;

    const done = release;
    release = undefined;
    running = undefined;
    done?.(report);
  };

  const schedule = (): void => {
    if (running === undefined) {
      running = new Promise<CheckReport>((resolve) => {
        release = resolve;
      });
    }
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(run, SETTLE_MS);
  };

  const onFile = (event: string, path: string): void => {
    const posix = toPosix(path);
    const relevant =
      inputs.has(keyOf(posix)) ||
      // A `.fud` that appears or goes away changes the program even if nobody read it yet.
      (posix.endsWith('.fud') && event !== 'change') ||
      /(^|\/)tsconfig(\.[^/]*)?\.json$/u.test(posix);
    if (!relevant) return;
    checker.invalidate(posix);
    schedule();
  };

  server.watcher.on('all', onFile);
  schedule();

  return {
    current: () => running ?? Promise.resolve(report),
    async blocking(files) {
      const latest = await (running ?? Promise.resolve(report));
      const graph = new Set(files.map(keyOf));
      const project = latest.project.find((problem) => problem.severity === 'error');
      if (project !== undefined) return projectOverlay(project);
      const problem = latest.problems.find(
        (candidate) => candidate.severity === 'error' && graph.has(keyOf(candidate.file)),
      );
      return problem === undefined ? undefined : overlayOf(problem);
    },
    dispose() {
      if (timer !== undefined) clearTimeout(timer);
      server.watcher.off('all', onFile);
    },
  };
}

/** An overlay error as an `Error`, which is what Vite's error middleware expects from `next`. */
export function asError(overlay: OverlayError): Error {
  const error = new Error(overlay.message);
  return Object.assign(error, overlay);
}

/** The first error of a report, project problems first: the one the overlay shows. */
function firstError(report: CheckReport): OverlayError | undefined {
  const project = report.project.find((problem) => problem.severity === 'error');
  if (project !== undefined) return projectOverlay(project);
  const problem = report.problems.find((candidate) => candidate.severity === 'error');
  return problem === undefined ? undefined : overlayOf(problem);
}

/** A problem of a file, positioned the way the overlay shows a transform error. */
function overlayOf(problem: CheckProblem): OverlayError {
  const source = readSource(problem.file);
  const base: OverlayError = {
    message: `${problem.code}: ${problem.message}`,
    stack: '',
    id: problem.file,
    plugin: 'fudic',
  };
  if (source === undefined) return base;
  const at = locateProblem(problem, source);
  return {
    ...base,
    frame: at.frame,
    loc: { file: problem.file, line: at.start.line, column: at.start.column },
  };
}

function projectOverlay(problem: ProjectProblem): OverlayError {
  return { message: `${problem.code}: ${problem.message}`, stack: '', plugin: 'fudic' };
}

/** One spelling per file, case-folded where the filesystem folds case. */
function keyOf(path: string): string {
  const posix = toPosix(path);
  return process.platform === 'win32' || process.platform === 'darwin' ? posix.toLowerCase() : posix;
}

function readSource(file: string): string | undefined {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}
