/**
 * A session: the `.fudspec` read and validated, the fixture executed, the plan made and its
 * pages written. Loaded on start and again whenever one of those files changes.
 *
 * The fixture and the terms run through Vite (`ssrLoadModule`): an `import { signal } from
 * '@fudic/core'` inside a fixture resolves as it does in the app, and Vite's graph knows when a
 * module changed, where a Node `import()` with `?t=` leaves one live module per run.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { FUD0950, FUD0953, FUD0973, FUD1207, type FudDiagnostic, type SourceDiagnostic } from '@fudic/diagnostics';
import {
  parseSpec,
  specContextOf,
  validateSpec,
  type BlockKind,
  type SpecContext,
  type SpecFile,
  type SpecFs,
  type TermCatalog,
} from '@fudic/spec';
import type { ViteDevServer } from 'vite';
import type { App } from './app.js';
import { needsOffline, planApp, type AppFixtures } from './app-plan.js';
import { firstLine } from './browser.js';
import { MissingTermError, namedArgs, type LoadedTerm, type TermLoader } from './engine.js';
import type { LoadedExtension } from './extension.js';
import { loadProjectExtension, missingRuntime, resolveRuntime, type TermsRuntime } from './runtime.js';
import { planBench, readCriterion, type BenchPlan, type ExecutedFixtures, type PlannedCriterion } from './pages.js';
import {
  problemOf,
  toWire,
  type DescribedCriterion,
  type DescribedStep,
  type ProblemMessage,
  type SessionMessage,
} from './protocol.js';
import type { ReportSource } from './report-of.js';
import type { BenchTarget } from './target.js';
import { writePlanFiles } from './bench-dir.js';
import { componentFiles } from './links.js';
import { invalidateFile } from './vite.js';

export interface SessionInput {
  readonly target: BenchTarget;
  readonly vite: ViteDevServer;
  /** The workbench folder the pages are written into. */
  readonly dir: string;
  /**
   * The stock runtime: absent, `@fudic/terms` as the project resolves it; null, none.
   * Injected by the tests that need one project with and without it.
   */
  readonly runtime?: TermsRuntime | null;
  /** The app's Vite, for a page or a flow (SDD-82 §3.8): started on the first call. */
  readonly app?: () => Promise<App>;
  /** It records (SDD-82 §3.9): a page's or a flow's criteria run without `data` and `answers`. */
  readonly record?: boolean;
}

export interface LoadedSession {
  readonly criteria: readonly PlannedCriterion[];
  readonly message: SessionMessage;
  readonly loadTerm: TermLoader;
  /** The stock extension (or the one that says it is missing), then the project's. */
  readonly extensions: readonly LoadedExtension[];
  /** The `.fud` files the component reads: a save of one of them reruns it. */
  readonly reads: ReadonlySet<string>;
  /** What the report of each criterion is read from. */
  readonly source: ReportSource;
  /** The component does not compile: every error of it, for the shells. */
  readonly problem?: ProblemMessage;
}

/** The disk, as the catalog and the validator read it. */
export const nodeSpecFs: SpecFs = {
  readDirectory(path) {
    try {
      return readdirSync(path);
    } catch {
      return [];
    }
  },
  readFile: readText,
};

export function readText(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

const EMPTY_SPEC: SpecFile = { kind: 'spec', criteria: [], comments: [], span: { start: 0, end: 0 } };

export async function loadSession(input: SessionInput): Promise<LoadedSession> {
  const { target, vite } = input;
  const runtime = input.runtime === undefined ? await resolveRuntime(target.projectRoot) : input.runtime;
  const context = specContext(target, runtime);
  const loadTerm = termLoader(context.terms, vite);
  const project = await loadProjectExtension(target.projectRoot, vite);
  const extensions: LoadedExtension[] = [runtime?.stock ?? missingRuntime(target.projectRoot)];
  if (project !== null && !('error' in project)) extensions.push(project);
  const diagnostics: { diagnostic: FudDiagnostic; file: string | null }[] = [];
  const reads = componentFiles(target.component, readText);

  let spec = EMPTY_SPEC;
  let specText = '';
  const source = (expectations: ReportSource['expectations']): ReportSource => ({
    root: target.projectRoot,
    spec: target.spec ?? target.component,
    text: specText,
    expectations,
    read: readText,
  });
  if (target.spec !== null) {
    specText = readText(target.spec) ?? '';
    const parsed = parseSpec(specText);
    spec = parsed.value;
    const validated = validateSpec(spec, context);
    const found = [...parsed.diagnostics, ...(input.record === true ? validated.filter((d) => !aboutRecorded(spec, d)) : validated)];
    for (const diagnostic of found) diagnostics.push({ diagnostic, file: target.spec });
    // A file with errors is not run: half a file gives greens that mean nothing.
    if (found.some((d) => d.severity === 'error')) {
      const message = sessionMessage(target, diagnostics, []);
      return { criteria: [], message, loadTerm, extensions, reads, source: source(new Map()) };
    }
  }

  // A page or a flow runs on the app's Vite: its fixture is executed there, so a service it
  // replaces is the very class the app's server injects (SDD-82 §4.3).
  const app = target.kind === undefined ? undefined : await input.app?.();
  const appVite = app?.vite ?? vite;
  const executed = await executeFixture(target, appVite);
  if (executed.error !== undefined) diagnostics.push({ diagnostic: executed.error, file: target.fixture });

  let fixtureOk: readonly PlannedCriterion[];
  if (target.kind === undefined) {
    const plan = planBench({ target, spec, fixtures: executed.fixtures, dir: input.dir });
    for (const diagnostic of plan.diagnostics) diagnostics.push({ diagnostic, file: null });
    writePlanFiles(input.dir, target.tag, plan.files);
    for (const name of plan.files.keys()) invalidateFile(vite, `${input.dir}/${name}`);
    fixtureOk = executed.error === undefined ? plan.criteria : failProps(plan, executed.error);
  } else {
    fixtureOk = await appCriteria(target, spec, executed, app, context, input.record === true);
  }
  // A `fudic/bench.js` that does not load leaves every criterion in error, saying why.
  const criteria =
    project !== null && 'error' in project
      ? fixtureOk.map((c) => ({ ...c, error: project.error, problem: project.problem }))
      : fixtureOk;
  // The 1-based line of an offset: the margin, Problems and the shell point at it.
  const lineOf = (offset: number) => specText.slice(0, offset).split('\n').length;
  const described = await Promise.all(criteria.map((c) => describeCriterion(c, lineOf, loadTerm)));
  const expectations = new Map(described.map((d) => [d.criterion.id, d.expectations]));
  const message = sessionMessage(target, diagnostics, described.map((d) => d.criterion));
  // A flow has no page of its own to compile.
  const problem = target.kind === 'flow' ? undefined : await compileProblem(appVite, target.component);
  return { criteria, message, loadTerm, extensions, reads, source: source(expectations), ...(problem !== undefined ? { problem } : {}) };
}

/**
 * The component compiled as its pages will compile it: when it does not, its pages answer an
 * error and say nothing of why, so the reason is published here, with every diagnostic.
 */
async function compileProblem(vite: ViteDevServer, component: string): Promise<ProblemMessage | undefined> {
  invalidateFile(vite, component);
  try {
    await vite.environments['ssr']!.transformRequest(component);
    return undefined;
  } catch (error) {
    return problemOf(error);
  }
}

/**
 * The editor's context, with the one component the bench mounts: `fudic/terms/` of the project
 * first, then the framework's of the runtime it resolved.
 */
function specContext(target: BenchTarget, runtime: TermsRuntime | null): SpecContext {
  return specContextOf(target.projectRoot, {
    fs: nodeSpecFs,
    component: (tag) => (tag === target.tag ? { tag, path: target.component, requiredProps: 'unknown' } : undefined),
    frameworkTerms: runtime?.termsDir ?? null,
  });
}

/** The fixture's `export default`, run by Vite after forgetting the last run. */
async function executeFixture(
  target: BenchTarget,
  vite: ViteDevServer,
): Promise<{ fixtures: ExecutedFixtures; error?: FudDiagnostic }> {
  if (target.fixture === null) return { fixtures: {} };
  invalidateFile(vite, target.fixture);
  try {
    const module = await vite.ssrLoadModule(target.fixture);
    return { fixtures: (module['default'] ?? {}) as ExecutedFixtures };
  } catch (error) {
    return { fixtures: {}, error: FUD0973({ file: target.fixture, reason: firstLine(error) }) };
  }
}

/**
 * The criteria of a page or a flow: each one on the app's Vite, with what its fixture lines
 * name. Without the app, or with a fixture that threw, every one ends in error saying why.
 */
async function appCriteria(
  target: BenchTarget,
  spec: SpecFile,
  executed: { fixtures: ExecutedFixtures; error?: FudDiagnostic },
  app: App | undefined,
  context: SpecContext,
  record: boolean,
): Promise<readonly PlannedCriterion[]> {
  const pattern = target.route === undefined ? undefined : context.page(target.route)?.pattern;
  // The criteria without network run on the app built (§4.7): built only when one of them is here.
  const offline = app !== undefined && spec.criteria.some((c) => needsOffline(readCriterion(c).steps)) ? await previewOf(app) : undefined;
  const planned = planApp({
    target,
    spec,
    fixtures: executed.fixtures as AppFixtures,
    app: app ?? { origin: '', bench: undefined as never, run: '', paths: undefined as never },
    ...(record ? { record } : {}),
    ...(pattern !== undefined ? { pattern } : {}),
    ...(typeof offline === 'string' ? { offline } : {}),
  });
  const problem = executed.error ?? (app === undefined ? FUD1207({ reason: "the app's Vite is not running" }) : undefined);
  if (problem !== undefined) return planned.map((c) => ({ ...c, error: problem.message, problem }));
  // A build that failed leaves the criteria without network in error, saying why; the rest run.
  if (offline === undefined || typeof offline === 'string') return planned;
  return planned.map((c) => (needsOffline(c.steps) ? { ...c, error: offline.message, problem: offline } : c));
}

/** The codes of a fixture line that names nothing, taken from the codes themselves. */
const NAMES_NOTHING = new Set([
  FUD0950({ span: { start: 0, end: 0 }, line: '', fixture: '', available: [] }).code,
  FUD0953({ span: { start: 0, end: 0 }, fixture: '' }).code,
]);

/**
 * Whether a diagnostic says that a `data` or `answers` line names nothing: what recording is
 * about to write (SDD-82 §3.9), so it does not stop the criterion from running.
 */
function aboutRecorded(spec: SpecFile, diagnostic: SourceDiagnostic): boolean {
  if (!NAMES_NOTHING.has(diagnostic.code)) return false;
  const { start } = diagnostic.span;
  return spec.criteria.some((c) =>
    c.blocks.some((b) => b.terms.some((t) => (t.name.text === 'data' || t.name.text === 'answers') && t.span.start <= start && start <= t.span.end)),
  );
}

/** The origin of the app built, or why it could not be built. */
async function previewOf(app: App): Promise<string | FudDiagnostic> {
  try {
    return (await app.offline()).origin;
  } catch (error) {
    return FUD1207({ reason: `the app does not build for the criteria without network: ${firstLine(error)}` });
  }
}

/** A fixture that threw leaves the criteria that mount with props in error; the rest still run. */
function failProps(plan: BenchPlan, problem: FudDiagnostic): PlannedCriterion[] {
  return plan.criteria.map((c) => (c.fixture === null ? c : { ...c, error: problem.message, problem }));
}

/** A term module, resolved in the catalog and executed by Vite. */
function termLoader(catalog: TermCatalog, vite: ViteDevServer): TermLoader {
  return async (block: BlockKind, name: string): Promise<LoadedTerm> => {
    const module = catalog.resolve(block, name);
    if (module === undefined) throw new MissingTermError(block, name);
    const loaded = await vite.ssrLoadModule(module.path);
    const meta = loaded['meta'] as { describe?: LoadedTerm['describe']; negative?: LoadedTerm['negative'] } | undefined;
    return {
      path: module.path,
      layer: module.layer,
      params: module.params,
      ...(typeof meta?.describe === 'function' ? { describe: meta.describe } : {}),
      ...(meta?.negative !== undefined ? { negative: meta.negative } : {}),
      run: loaded['run'] as LoadedTerm['run'],
    };
  };
}

/**
 * Each step's line, from `meta.describe` run with its arguments; the line as written when the term
 * has no `describe`, or its `describe` throws, or the term does not load. The step names its
 * module whenever the term loaded. Beside it, what each `describe` said, for the report: null
 * where there was none.
 */
async function describeCriterion(
  criterion: PlannedCriterion,
  lineOf: (offset: number) => number,
  loadTerm: TermLoader,
): Promise<{ criterion: DescribedCriterion; expectations: (string | null)[] }> {
  const described = await Promise.all(
    criterion.steps.map(async (step): Promise<{ step: DescribedStep; describe: string | null }> => {
      const written = [step.term, ...step.args].join(' ');
      const line = lineOf(step.offset);
      let term: LoadedTerm;
      try {
        term = await loadTerm(step.block, step.term);
      } catch {
        return { step: { block: step.block, text: written, file: null, line }, describe: null };
      }
      let describe: string | null = null;
      try {
        describe = term.describe?.(namedArgs(term.params, step.args)) ?? null;
      } catch {
        // A describe that throws is the term's problem: the step still reads as written.
      }
      return { step: { block: step.block, text: describe ?? written, file: term.path, line }, describe };
    }),
  );
  const props =
    criterion.fixture === null || criterion.propsOffset === undefined
      ? null
      : { name: criterion.fixture, line: lineOf(criterion.propsOffset) };
  const steps = described.map((d) => d.step);
  return {
    // A page's or a flow's lives on the app's Vite, not on the shell's server (SDD-82 §8.2.60).
    criterion: { id: criterion.id, route: (criterion.app?.origin ?? '') + criterion.route, line: lineOf(criterion.offset), props, steps },
    expectations: described.map((d) => d.describe),
  };
}

function sessionMessage(
  target: BenchTarget,
  diagnostics: readonly { diagnostic: FudDiagnostic; file: string | null }[],
  criteria: readonly DescribedCriterion[],
): SessionMessage {
  return {
    v: 2,
    type: 'session',
    tag: target.tag,
    spec: target.spec,
    diagnostics: diagnostics.map((d) => toWire(d.diagnostic, d.file, readText)),
    criteria,
  };
}
