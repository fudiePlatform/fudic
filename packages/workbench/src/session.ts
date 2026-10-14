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
  /** The framework's `terms/` folder; absent while no package offers one. */
  readonly frameworkTerms?: string;
}

export interface LoadedSession {
  readonly criteria: readonly PlannedCriterion[];
  readonly message: SessionMessage;
  readonly loadTerm: TermLoader;
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
  const catalog = createTermCatalog(termRoots(input), nodeSpecFs);
  const loadTerm = termLoader(catalog, vite);
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
      return { criteria: [], message: sessionMessage(target, diagnostics, []), loadTerm, reads };
    }
  }

  const executed = await executeFixture(target, vite);
  if (executed.error !== undefined) diagnostics.push({ diagnostic: executed.error, file: target.fixture });

  const plan = planBench({ target, spec, fixtures: executed.fixtures, dir: input.dir });
  for (const diagnostic of plan.diagnostics) diagnostics.push({ diagnostic, file: null });
  writePlanFiles(input.dir, target.tag, plan.files);
  for (const name of plan.files.keys()) invalidateFile(vite, `${input.dir}/${name}`);

  const criteria = executed.error === undefined ? plan.criteria : failProps(plan, executed.error.message);
  const lines = criterionLines(spec, specText);
  const described = await Promise.all(criteria.map((c) => describeCriterion(c, lines.get(c.id) ?? 1, loadTerm)));
  return { criteria, message: sessionMessage(target, diagnostics, described), loadTerm, reads };
}

/** Each criterion's slug → the 1-based line of its `criterion` keyword. */
function criterionLines(spec: SpecFile, text: string): ReadonlyMap<string, number> {
  const lines = new Map<string, number>();
  for (const criterion of spec.criteria) {
    if (criterion.slug === undefined) continue;
    lines.set(criterion.slug.text, text.slice(0, criterion.keyword.start).split('\n').length);
  }
  return lines;
}

/** `fudic/terms/` of the project first, then the framework's: the editor's roots, in its order. */
function termRoots(input: SessionInput): TermRoot[] {
  const roots: TermRoot[] = [{ layer: 'workspace', path: `${input.target.projectRoot}/${TERMS_DIR}` }];
  if (input.frameworkTerms !== undefined) roots.push({ layer: 'framework', path: input.frameworkTerms });
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
  line: number,
  loadTerm: TermLoader,
): Promise<DescribedCriterion> {
  const steps = await Promise.all(
    criterion.steps.map(async (step): Promise<DescribedStep> => {
      const written = [step.term, ...step.args].join(' ');
      let term: LoadedTerm;
      try {
        term = await loadTerm(step.block, step.term);
      } catch {
        return { block: step.block, text: written, file: null };
      }
      let text = written;
      try {
        text = term.describe?.(namedArgs(term.params, step.args)) ?? written;
      } catch {
        // A describe that throws is the term's problem: the step still reads as written.
      }
      return { block: step.block, text, file: term.path };
    }),
  );
  return { id: criterion.id, route: criterion.route, line, steps };
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
