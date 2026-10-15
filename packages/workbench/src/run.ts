/**
 * `fudic-workbench run`: the criteria of every `.fudspec` found, run once, without a shell, and an
 * answer — so they can be a `pnpm test` and a CI step. Same project start (`startProject`), same
 * session, same engine as the workbench the editor opens.
 *
 * Components run one after another, each with its criteria in parallel; projects (a monorepo run
 * from its root) one after another too, each with its own Vite.
 */

import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { FUD0972, FUD0976, type FudDiagnostic } from '@fudic/diagnostics';
import { SPEC_EXTENSION } from '@fudic/spec';
import type { BrowserChoice, BrowserName } from './browser.js';
import { runCriterion } from './engine.js';
import { nodeTargetFs } from './open.js';
import { startProject } from './project.js';
import type { BenchMessage, ResultMessage } from './protocol.js';
import { DEFAULT_WORKERS, runPool } from './runner.js';
import { loadSession } from './session.js';
import { resolveTarget, slashes, type BenchTarget } from './target.js';
import { isFailure, type WorkbenchFailure } from './types.js';

export interface RunOptions {
  readonly browser?: BrowserChoice;
  readonly workers?: number;
  /** Where to look when no path is given; the current folder by default. */
  readonly root?: string;
  /** Every message, as the workbench would publish it. */
  readonly onMessage?: (message: BenchMessage) => void;
  /** A component finished: everything about it has been published. */
  readonly onDone?: (tag: string) => void;
  /** What is not about a criterion: a path that is no component, a component with no `.fudspec`. */
  readonly onDiagnostic?: (diagnostic: FudDiagnostic) => void;
}

export interface RunSummary {
  readonly pass: number;
  readonly fail: number;
  readonly error: number;
  readonly ms: number;
  /** The browser it ran in; null when nothing ran. */
  readonly browser: BrowserName | null;
  readonly results: readonly ResultMessage[];
}

/** Folders a search never enters: dependencies, builds, and anything hidden. */
const SKIPPED = new Set(['node_modules', 'dist']);

/** Every `.fudspec` under a folder, sorted. */
export function findSpecs(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED.has(entry.name) && !entry.name.startsWith('.')) found.push(...findSpecs(path));
    } else if (entry.name.endsWith(SPEC_EXTENSION)) {
      found.push(path);
    }
  }
  return found.sort();
}

/** The files the paths name: a folder stands for the `.fudspec` files under it. */
function filesOf(paths: readonly string[], root: string): string[] {
  if (paths.length === 0) return findSpecs(root);
  return paths.flatMap((path) => {
    const absolute = resolve(root, path);
    return statSync(absolute, { throwIfNoEntry: false })?.isDirectory() === true ? findSpecs(absolute) : [absolute];
  });
}

export async function runSpecs(paths: readonly string[], options: RunOptions = {}): Promise<RunSummary | WorkbenchFailure> {
  const started = Date.now();
  const root = resolve(options.root ?? '.');
  const tally = { pass: 0, fail: 0, error: 0 };
  const results: ResultMessage[] = [];
  const diagnose = (diagnostic: FudDiagnostic) => options.onDiagnostic?.(diagnostic);

  // Components, once each, grouped by project.
  const projects = new Map<string, Map<string, BenchTarget>>();
  for (const file of filesOf(paths, root)) {
    const target = resolveTarget(file, nodeTargetFs);
    if (isFailure(target)) {
      diagnose(target.diagnostic);
      tally.error++;
      continue;
    }
    if (target.spec === null) {
      diagnose(FUD0972({ file: target.component }));
      continue;
    }
    const components = projects.get(target.projectRoot) ?? new Map<string, BenchTarget>();
    components.set(target.component, target);
    projects.set(target.projectRoot, components);
  }
  if (projects.size === 0) return { diagnostic: FUD0976({ where: paths.length === 0 ? slashes(root) : paths.join(', ') }) };

  let browser: BrowserName | null = null;
  for (const [projectRoot, components] of projects) {
    const targets = [...components.values()];
    const project = await startProject({
      root: projectRoot,
      targets,
      options: {
        ...(options.browser !== undefined ? { browser: options.browser } : {}),
        ...(options.onMessage !== undefined ? { onMessage: options.onMessage } : {}),
      },
    });
    if (isFailure(project)) return project;
    browser = project.browser.name;
    try {
      for (const target of targets) {
        const session = await loadSession({ target, vite: project.vite, dir: project.dir });
        project.publish({ ...session.message, browser: project.browser.name, viewport: project.browser.viewport });
        // A `.fudspec` with errors runs nothing, and that is an error of the run.
        if (session.message.diagnostics.some((d) => d.severity === 'error')) tally.error++;
        if (session.criteria.length > 0) {
          project.publish({ v: 2, type: 'running', tag: target.tag, ids: session.criteria.map((c) => c.id), trigger: { file: null, at: Date.now() } });
          await runPool({
            criteria: session.criteria,
            workers: options.workers ?? DEFAULT_WORKERS,
            signal: new AbortController().signal,
            run: (criterion, signal) => runCriterion(project.browser, project.server.origin, criterion, session.loadTerm, signal),
            done: (result) => {
              const { shots: _shots, ...rest } = result;
              const message: ResultMessage = { v: 2, type: 'result', tag: target.tag, ...rest, shots: {} };
              tally[result.verdict]++;
              results.push(message);
              project.publish(message);
            },
          });
        }
        options.onDone?.(target.tag);
      }
    } finally {
      await project.close();
    }
  }
  return { ...tally, ms: Date.now() - started, browser, results };
}
