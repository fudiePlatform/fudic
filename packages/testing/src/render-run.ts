/**
 * `renderPiece`: one piece painted by the project's own vitest (SDD-78), the render its tests see.
 * A test file that calls `renderJob` is written under `.fudic/render`, run alone with the
 * project's `vitest.config`, and its outcome read back; both files are removed after.
 *
 * Node only, like `runTests`.
 */

import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { FUD1207, type WireDiagnostic } from '@fudic/diagnostics';
import { compileDiagnosticsOf } from '@fudic/vite';
import type { Reporter, TestModule } from 'vitest/node';
import type { RenderOutcome } from './render.js';

/** Where the render's files are written, relative to the project. */
export const RENDER_DIR = '.fudic/render';

export type RenderPieceTarget =
  | { readonly route: string }
  | {
      /** The component's `.fud`, absolute. */
      readonly component: string;
      /** Its fixture's file, absolute, when it has one. */
      readonly fixture?: string;
      readonly case?: string;
      /** JSON: they are written into the test file as a literal. */
      readonly props?: Readonly<Record<string, unknown>>;
    };

export interface RenderPieceOptions {
  readonly root: string;
  readonly target: RenderPieceTarget;
  readonly select?: string;
}

/** What `renderJob` answered, or why the file that calls it never ran: it did not compile. */
export type RenderPieceResult = RenderOutcome | { readonly kind: 'broken'; readonly diagnostics: readonly WireDiagnostic[] };

const path = (file: string): string => JSON.stringify(file.replace(/\\/gu, '/'));

/** The test file that paints the piece and writes what came out to `out`. */
export function renderSource(options: RenderPieceOptions, out: string): string {
  const { target } = options;
  const imports = ["import { writeFileSync } from 'node:fs';", "import { test } from 'vitest';", "import { renderJob } from '@fudic/testing/render';"];
  let job: string;
  if ('route' in target) job = `{ route: ${JSON.stringify(target.route)} }`;
  else {
    imports.push(`import * as piece from ${path(target.component)};`);
    if (target.fixture !== undefined) imports.push(`import fixture from ${path(target.fixture)};`);
    const fields = [
      'component: piece',
      ...(target.fixture !== undefined ? ['fixture'] : []),
      ...(target.case !== undefined ? [`case: ${JSON.stringify(target.case)}`] : []),
      ...(target.props !== undefined ? [`props: ${JSON.stringify(target.props)}`] : []),
    ];
    job = `{ ${fields.join(', ')} }`;
  }
  const select = options.select === undefined ? '' : `, select: ${JSON.stringify(options.select)}`;
  return [
    ...imports,
    '',
    "test('fudic render', async () => {",
    `  writeFileSync(${path(out)}, JSON.stringify(await renderJob({ target: ${job}${select} })));`,
    '}, 60_000);',
    '',
  ].join('\n');
}

/** The one module vitest ran, or nothing when it never got to it. */
async function vitestRun(root: string, file: string): Promise<TestModule | undefined> {
  let modules: readonly TestModule[] = [];
  const collect: Reporter = {
    onTestRunEnd(testModules) {
      modules = testModules;
    },
  };
  const { createVitest } = await import('vitest/node');
  // Relative to the project, with forward slashes: what a glob of `include` is read as.
  const glob = relative(root, file).replace(/\\/gu, '/');
  const vitest = await createVitest('test', { root, run: true, watch: false, include: [glob], passWithNoTests: true, reporters: [collect] });
  try {
    await vitest.start([file]);
  } finally {
    await vitest.close();
  }
  return modules[0];
}

function could(reason: string): WireDiagnostic {
  const { code, severity, message } = FUD1207({ reason });
  return { code, severity, message, file: null, line: null, column: null };
}

/** Why the file did not answer: what the `.fud` it imports says when it did not compile. */
function brokenOf(module: TestModule | undefined): RenderPieceResult {
  const errors = (module?.errors() ?? []) as readonly { readonly message: string }[];
  const diagnostics = errors.flatMap((error) => compileDiagnosticsOf(error) ?? [could(error.message.split('\n')[0]!)]);
  return { kind: 'broken', diagnostics: diagnostics.length > 0 ? diagnostics : [could('the render did not run')] };
}

export async function renderPiece(options: RenderPieceOptions): Promise<RenderPieceResult> {
  const root = resolve(options.root);
  const dir = resolve(root, RENDER_DIR);
  mkdirSync(dir, { recursive: true });
  const id = randomUUID();
  const file = resolve(dir, `${id}.test.ts`);
  const out = resolve(dir, `${id}.json`);
  writeFileSync(file, renderSource(options, out));
  try {
    const module = await vitestRun(root, file);
    try {
      return JSON.parse(readFileSync(out, 'utf8')) as RenderOutcome;
    } catch {
      return brokenOf(module);
    }
  } catch (error) {
    return { kind: 'broken', diagnostics: [could(error instanceof Error ? error.message : String(error))] };
  } finally {
    rmSync(file, { force: true });
    rmSync(out, { force: true });
  }
}
