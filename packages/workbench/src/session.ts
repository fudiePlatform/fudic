/**
 * A session: the `.fudspec` read and validated, the fixture executed, the plan made and its
 * pages written. Loaded on start and again whenever one of those files changes.
 *
 * The fixture and the terms run through Vite (`ssrLoadModule`): an `import { signal } from
 * '@fudic/core'` inside a fixture resolves as it does in the app, and Vite's graph knows when a
 * module changed, where a Node `import()` with `?t=` leaves one live module per run.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { FUD0973, type FudDiagnostic } from '@fudic/diagnostics';
import {
  TERMS_DIR,
  createTermCatalog,
  parseSpec,
  readFixtures,
  validateSpec,
  type BlockKind,
  type SpecFile,
  type SpecFs,
  type TermCatalog,
  type TermRoot,
} from '@fudic/spec';
import type { ViteDevServer } from 'vite';
import { firstLine } from './browser.js';
import { namedArgs, type LoadedTerm, type TermLoader } from './engine.js';
import type { LoadedExtension } from './extension.js';
import { loadProjectExtension, missingRuntime, resolveRuntime, type TermsRuntime } from './runtime.js';
import { planBench, type BenchPlan, type ExecutedFixtures, type PlannedCriterion } from './pages.js';
import { toWire, type DescribedCriterion, type DescribedStep, type SessionMessage } from './protocol.js';
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
}

export interface LoadedSession {
  readonly criteria: readonly PlannedCriterion[];
  readonly message: SessionMessage;
  readonly loadTerm: TermLoader;
  /** The stock extension (or the one that says it is missing), then the project's. */
  readonly extensions: readonly LoadedExtension[];
  /** The `.fud` files the component reads: a save of one of them reruns it. */
  readonly reads: ReadonlySet<string>;
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
  const catalog = createTermCatalog(termRoots(target, runtime), nodeSpecFs);
  const loadTerm = termLoader(catalog, vite);
  const project = await loadProjectExtension(target.projectRoot, vite);
  const extensions: LoadedExtension[] = [runtime?.stock ?? missingRuntime(target.projectRoot)];
  if (project !== null && !('error' in project)) extensions.push(project);
  const diagnostics: { diagnostic: FudDiagnostic; file: string | null }[] = [];
  const reads = componentFiles(target.component, readText);

  let spec = EMPTY_SPEC;
  let specText = '';
  if (target.spec !== null) {
    specText = readText(target.spec) ?? '';
    const parsed = parseSpec(specText);
    spec = parsed.value;
    const found = [...parsed.diagnostics, ...validateSpec(spec, specContext(target, catalog))];
    for (const diagnostic of found) diagnostics.push({ diagnostic, file: target.spec });
    // A file with errors is not run: half a file gives greens that mean nothing.
    if (found.some((d) => d.severity === 'error')) {
      return { criteria: [], message: sessionMessage(target, diagnostics, []), loadTerm, extensions, reads };
    }
  }

  const executed = await executeFixture(target, vite);
  if (executed.error !== undefined) diagnostics.push({ diagnostic: executed.error, file: target.fixture });

  const plan = planBench({ target, spec, fixtures: executed.fixtures, dir: input.dir });
  for (const diagnostic of plan.diagnostics) diagnostics.push({ diagnostic, file: null });
  writePlanFiles(input.dir, target.tag, plan.files);
  for (const name of plan.files.keys()) invalidateFile(vite, `${input.dir}/${name}`);

  const fixtureOk = executed.error === undefined ? plan.criteria : failProps(plan, executed.error.message);
  // A `fudic/bench.js` that does not load leaves every criterion in error, saying why.
  const criteria = project !== null && 'error' in project ? fixtureOk.map((c) => ({ ...c, error: project.error })) : fixtureOk;
  // The 1-based line of an offset: the margin, Problems and the shell point at it.
  const lineOf = (offset: number) => specText.slice(0, offset).split('\n').length;
  const described = await Promise.all(criteria.map((c) => describeCriterion(c, lineOf, loadTerm)));
  return { criteria, message: sessionMessage(target, diagnostics, described), loadTerm, extensions, reads };
}

/** `fudic/terms/` of the project first, then the framework's: the editor's roots, in its order. */
function termRoots(target: BenchTarget, runtime: TermsRuntime | null): TermRoot[] {
  const roots: TermRoot[] = [{ layer: 'workspace', path: `${target.projectRoot}/${TERMS_DIR}` }];
  if (runtime !== null) roots.push({ layer: 'framework', path: runtime.termsDir });
  return roots;
}

function specContext(target: BenchTarget, terms: TermCatalog) {
  return {
    terms,
    component: (tag: string) =>
      tag === target.tag ? { tag, path: target.component, requiredProps: 'unknown' as const } : undefined,
    fixtures: (tag: string) => {
      const source = tag === target.tag && target.fixture !== null ? readText(target.fixture) : undefined;
      return source === undefined ? undefined : readFixtures(source, target.fixture!);
    },
  };
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

/** A fixture that threw leaves the criteria that mount with props in error; the rest still run. */
function failProps(plan: BenchPlan, message: string): PlannedCriterion[] {
  return plan.criteria.map((c) => (c.fixture === null ? c : { ...c, error: message }));
}

/** A term module, resolved in the catalog and executed by Vite. */
function termLoader(catalog: TermCatalog, vite: ViteDevServer): TermLoader {
  return async (block: BlockKind, name: string): Promise<LoadedTerm> => {
    const module = catalog.resolve(block, name);
    if (module === undefined) throw new Error(`there is no ${block} term "${name}"`);
    const loaded = await vite.ssrLoadModule(module.path);
    const meta = loaded['meta'] as { describe?: LoadedTerm['describe'] } | undefined;
    return {
      path: module.path,
      layer: module.layer,
      params: module.params,
      ...(typeof meta?.describe === 'function' ? { describe: meta.describe } : {}),
      run: loaded['run'] as LoadedTerm['run'],
    };
  };
}

/**
 * Each step's line, from `meta.describe` run with its arguments; the line as written when the term
 * has no `describe`, or its `describe` throws, or the term does not load. The step names its
 * module whenever the term loaded.
 */
async function describeCriterion(
  criterion: PlannedCriterion,
  lineOf: (offset: number) => number,
  loadTerm: TermLoader,
): Promise<DescribedCriterion> {
  const steps = await Promise.all(
    criterion.steps.map(async (step): Promise<DescribedStep> => {
      const written = [step.term, ...step.args].join(' ');
      const line = lineOf(step.offset);
      let term: LoadedTerm;
      try {
        term = await loadTerm(step.block, step.term);
      } catch {
        return { block: step.block, text: written, file: null, line };
      }
      let text = written;
      try {
        text = term.describe?.(namedArgs(term.params, step.args)) ?? written;
      } catch {
        // A describe that throws is the term's problem: the step still reads as written.
      }
      return { block: step.block, text, file: term.path, line };
    }),
  );
  const props =
    criterion.fixture === null || criterion.propsOffset === undefined
      ? null
      : { name: criterion.fixture, line: lineOf(criterion.propsOffset) };
  return { id: criterion.id, route: criterion.route, line: lineOf(criterion.offset), props, steps };
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
