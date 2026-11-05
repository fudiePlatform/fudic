/**
 * `renderPiece`: one piece painted by the project's own vitest (SDD-78), the render its tests see.
 * A test file that calls `renderJob` is written under `.fudic/render`, run alone with the
 * project's `vitest.config`, and its outcome read back; both files are removed after.
 *
 * Node only, like `runTests`.
 */

import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { FUD1207, type WireDiagnostic } from '@fudic/diagnostics';
import { compileDiagnosticsOf } from '@fudic/vite';
import type { Reporter, TestModule } from 'vitest/node';
import type { CallOutcome } from './call.js';
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
/** Why the file that calls a job never answered: it did not compile, or vitest did not run it. */
export interface Broken {
  readonly kind: 'broken';
  readonly diagnostics: readonly WireDiagnostic[];
}

export type RenderPieceResult = RenderOutcome | Broken;

const path = (file: string): string => JSON.stringify(file.replace(/\\/gu, '/'));

/**
 * A module of the project as the test file beside `out` imports it: relative, as a test of the
 * project would. Imported by an absolute path, a `.fud` that links its `.fudapi` was compiled
 * without finding it.
 */
const from = (out: string, file: string): string => JSON.stringify(`./${relative(dirname(out), file).replace(/\\/gu, '/')}`);

/** The test file that paints the piece and writes what came out to `out`. */
export function renderSource(options: RenderPieceOptions, out: string): string {
  const { target } = options;
  const imports = ["import { writeFileSync } from 'node:fs';", "import { test } from 'vitest';", "import { renderJob } from '@fudic/testing/render';"];
  let job: string;
  if ('route' in target) job = `{ route: ${JSON.stringify(target.route)} }`;
  else {
    imports.push(`import * as piece from ${from(out, target.component)};`);
    if (target.fixture !== undefined) imports.push(`import fixture from ${from(out, target.fixture)};`);
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
function brokenOf(module: TestModule | undefined): Broken {
  const errors = (module?.errors() ?? []) as readonly { readonly message: string }[];
  const diagnostics = errors.flatMap((error) => compileDiagnosticsOf(error) ?? [could(error.message.split('\n')[0]!)]);
  return { kind: 'broken', diagnostics: diagnostics.length > 0 ? diagnostics : [could('the render did not run')] };
}

/** Writes the test file `source(out)` makes, runs it alone, and reads what it wrote to `out`. */
async function runJob<T>(root: string, source: (out: string) => string): Promise<T | Broken> {
  const dir = resolve(root, RENDER_DIR);
  mkdirSync(dir, { recursive: true });
  const id = randomUUID();
  const file = resolve(dir, `${id}.test.ts`);
  const out = resolve(dir, `${id}.json`);
  writeFileSync(file, source(out));
  try {
    const module = await vitestRun(root, file);
    try {
      return JSON.parse(readFileSync(out, 'utf8')) as T;
    } catch {
      return brokenOf(module);
    }
  } catch (error) {
    // Vitest rejects with an Error, even for what a config throws that is not one.
    return { kind: 'broken', diagnostics: [could((error as Error).message)] };
  } finally {
    rmSync(file, { force: true });
    rmSync(out, { force: true });
  }
}

export function renderPiece(options: RenderPieceOptions): Promise<RenderPieceResult> {
  return runJob<RenderOutcome>(resolve(options.root), (out) => renderSource(options, out));
}

export interface CallFunctionOptions {
  readonly root: string;
  /** `<id>` of the `.fudapi`: `routes/products`. */
  readonly id: string;
  readonly name: string;
  readonly args?: unknown;
  readonly params?: Readonly<Record<string, string>>;
  /** The dev server that answers. */
  readonly origin: string;
  readonly headers?: Readonly<Record<string, string>>;
}

export type CallFunctionResult = CallOutcome | Broken;

/** The test file that calls the function and writes what it answered to `out`. */
export function callSource(options: CallFunctionOptions, out: string): string {
  const fields = [
    `fn: api[${JSON.stringify(options.name)}]`,
    `origin: ${JSON.stringify(options.origin)}`,
    ...(options.args !== undefined ? [`args: ${JSON.stringify(options.args)}`] : []),
    ...(options.params !== undefined ? [`params: ${JSON.stringify(options.params)}`] : []),
    ...(options.headers !== undefined ? [`headers: ${JSON.stringify(options.headers)}`] : []),
  ];
  return [
    "import { writeFileSync } from 'node:fs';",
    "import { test } from 'vitest';",
    "import { callJob } from '@fudic/testing/render';",
    `import * as api from ${JSON.stringify(`fudic:${options.id}`)};`,
    '',
    "test('fudic call', async () => {",
    `  writeFileSync(${path(out)}, JSON.stringify(await callJob({ ${fields.join(', ')} })));`,
    '}, 60_000);',
    '',
  ].join('\n');
}

export function callFunction(options: CallFunctionOptions): Promise<CallFunctionResult> {
  return runJob<CallOutcome>(resolve(options.root), (out) => callSource(options, out));
}

export interface ListRoutesOptions {
  readonly root: string;
}

/** The concrete URLs of the project, or why the file that lists them did not answer. */
export type ListRoutesResult = { readonly kind: 'routes'; readonly routes: readonly string[] } | Broken;

/** The test file that lists the project's concrete URLs and writes them to `out`. */
export function routesSource(out: string): string {
  return [
    "import { writeFileSync } from 'node:fs';",
    "import { test } from 'vitest';",
    "import { concreteRoutes } from '@fudic/testing/render';",
    '',
    "test('fudic routes', async () => {",
    `  writeFileSync(${path(out)}, JSON.stringify({ kind: 'routes', routes: await concreteRoutes() }));`,
    '}, 60_000);',
    '',
  ].join('\n');
}

/** Every URL of the project that can be opened as it is: the routes without params, and the `paths()` of the rest. */
export function listRoutes(options: ListRoutesOptions): Promise<ListRoutesResult> {
  return runJob<ListRoutesResult>(resolve(options.root), routesSource);
}
