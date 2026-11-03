/**
 * `runTests`: the project's unit tests, run by vitest in this process, answered as a report a
 * machine reads without guessing. A test that did not pass is `fail` when an assertion said no,
 * and `broken` when it never got to say anything: it threw, it timed out, its file did not load.
 *
 * Node only: it starts vitest, which the browser cannot.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, posix, resolve } from 'node:path';
import { FUD1207, type FilePosition, type WireDiagnostic } from '@fudic/diagnostics';
import { compileDiagnosticsOf } from '@fudic/vite';
import type { Reporter, TestCase, TestModule } from 'vitest/node';

export interface RunTestsOptions {
  /** The project. */
  readonly root: string;
  /** Test files or folders; none = every test of the project. */
  readonly paths?: readonly string[];
  /** Only tests whose full name contains one of these. */
  readonly names?: readonly string[];
  /** Only what did not pass in the last report. */
  readonly failing?: boolean;
}

export interface FileCounts {
  readonly file: string;
  readonly pass: number;
  readonly fail: number;
  readonly broken: number;
  readonly skipped: number;
}

export interface TestReport {
  readonly summary: { readonly pass: number; readonly fail: number; readonly broken: number; readonly skipped: number };
  /** Every test that did not pass, plus every file that could not load. Passing tests are only counted. */
  readonly tests: readonly TestResult[];
  /** The same counts per test file, in path order: every file that ran, green ones included. */
  readonly files: readonly FileCounts[];
  readonly ms: number;
}

export type TestResult = FailedTest | BrokenTest;

export interface FailedTest {
  readonly verdict: 'fail';
  readonly file: string;
  /** The full name: `"acme-button > disabled: a click does not emit press"`. */
  readonly name: string;
  /** The line of the `expect` that failed. */
  readonly at: FilePosition;
  /** That line, trimmed. */
  readonly quote: string;
  readonly expected?: string;
  readonly actual?: string;
  /** The assertion's first line. */
  readonly message: string;
}

export interface BrokenTest {
  readonly verdict: 'broken';
  readonly file: string;
  /** Null when the whole file did not load. */
  readonly name: string | null;
  readonly at?: FilePosition;
  readonly quote?: string;
  /** The diagnostics of a `.fud` that did not compile, with their place in it; otherwise one FUD1207. */
  readonly diagnostics: readonly WireDiagnostic[];
}

/** Where the last report is kept, relative to the project root. */
export const LAST_TEST_REPORT = '.fudic/runs/last-test.json';

/** The names vitest gives the errors of an assertion: its own `expect` and jest-dom's matchers. */
const ASSERTIONS = new Set(['AssertionError', 'JestAssertionError']);

/** A test file, as the project names them. */
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;

/** An error as vitest hands it over: serialized, so a class is only its `name`. */
interface ReportedError {
  readonly name?: string;
  readonly message: string;
  readonly expected?: unknown;
  readonly actual?: unknown;
  /** Parsed by vitest for every error it reports, even an empty one. */
  readonly stacks: readonly { readonly file: string; readonly line: number; readonly column: number }[];
  /** What vitest adds to the error of a matcher of `expect.extend`. */
  readonly __vitest_error_context__?: { readonly assertionName?: unknown };
}

export async function runTests(options: RunTestsOptions): Promise<TestReport> {
  const started = Date.now();
  const root = resolve(options.root);
  let report: TestReport;
  try {
    report = await run(root, options, started);
  } catch (error) {
    report = {
      summary: { pass: 0, fail: 0, broken: 1, skipped: 0 },
      tests: [{ verdict: 'broken', file: '.', name: null, diagnostics: [could(firstLine(error))] }],
      files: [],
      ms: Date.now() - started,
    };
  }
  keep(root, report);
  return report;
}

/** One vitest run: these files (none = every one), and only these names when there are any. */
interface Pass {
  readonly paths?: readonly string[];
  readonly names?: readonly string[];
}

async function run(root: string, options: RunTestsOptions, started: number): Promise<TestReport> {
  const passes = options.failing === true ? lastFailing(root, options) : [options];
  const modules: TestModule[] = [];
  for (const pass of passes) modules.push(...(await vitestRun(root, pass)));
  return reportOf(root, modules, Date.now() - started);
}

async function vitestRun(root: string, { paths, names }: Pass): Promise<readonly TestModule[]> {
  let modules: readonly TestModule[] = [];
  const collect: Reporter = {
    onTestRunEnd(testModules) {
      modules = testModules;
    },
  };
  const { createVitest } = await import('vitest/node');
  const vitest = await createVitest('test', {
    root,
    run: true,
    watch: false,
    passWithNoTests: true,
    reporters: [collect],
    ...(names === undefined ? {} : { testNamePattern: namePattern(names) }),
  });
  try {
    await vitest.start(paths === undefined ? [] : [...paths]);
  } finally {
    await vitest.close();
  }
  return modules;
}

/**
 * What did not pass last time. A file that did not load runs whole; a test that failed runs by
 * its name, in its file. Two runs, because vitest has one name filter for every file. With no
 * report before, everything; with one where everything passed, nothing.
 */
function lastFailing(root: string, options: RunTestsOptions): readonly Pass[] {
  const last = readLast(root);
  if (last === undefined) return [options];
  const whole = [...new Set(last.tests.flatMap((test) => (test.name === null ? [test.file] : [])))];
  // A file that did not load has no tests of its own: the two lists never share a file.
  const named = last.tests.filter((test) => test.name !== null);
  const passes: Pass[] = [];
  if (whole.length > 0) passes.push({ paths: whole });
  if (named.length > 0) {
    passes.push({ paths: [...new Set(named.map((test) => test.file))], names: named.map((test) => test.name!) });
  }
  return passes;
}

function readLast(root: string): TestReport | undefined {
  try {
    return JSON.parse(readFileSync(resolve(root, LAST_TEST_REPORT), 'utf8')) as TestReport;
  } catch {
    return undefined;
  }
}

function keep(root: string, report: TestReport): void {
  const file = resolve(root, LAST_TEST_REPORT);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
}

/**
 * The names as vitest's filter reads them: it matches the full name with its parts joined by a
 * space, where the report joins them with ` > `. Each name literal; any of them.
 */
function namePattern(names: readonly string[]): string {
  return names.map((name) => name.split(' > ').join(' ').replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')).join('|');
}

function reportOf(root: string, modules: readonly TestModule[], ms: number): TestReport {
  const tests: TestResult[] = [];
  const files: FileCounts[] = [];
  const sorted = [...modules].sort((a, b) => a.moduleId.localeCompare(b.moduleId));
  for (const module of sorted) {
    const file = relativeTo(root, module.moduleId);
    const counts = { file, pass: 0, fail: 0, broken: 0, skipped: 0 };
    const loadErrors = module.errors();
    if (loadErrors.length > 0) {
      counts.broken++;
      tests.push(brokenFile(file, loadErrors as readonly ReportedError[]));
    }
    for (const test of module.children.allTests()) {
      const result = test.result();
      if (result.state === 'passed') counts.pass++;
      else if (result.state === 'failed') {
        const entry = failedTest(root, file, test, result.errors as readonly ReportedError[]);
        counts[entry.verdict === 'fail' ? 'fail' : 'broken']++;
        tests.push(entry);
      } else counts.skipped++;
    }
    files.push(counts);
  }
  const summary = { pass: 0, fail: 0, broken: 0, skipped: 0 };
  for (const counts of files) {
    summary.pass += counts.pass;
    summary.fail += counts.fail;
    summary.broken += counts.broken;
    summary.skipped += counts.skipped;
  }
  return { summary, tests, files, ms };
}

/** A file that did not load: the `.fud` it imports did not compile, or the file itself. */
function brokenFile(file: string, errors: readonly ReportedError[]): BrokenTest {
  return { verdict: 'broken', file, name: null, diagnostics: errors.flatMap((error) => diagnosticsOf(error)) };
}

function failedTest(root: string, file: string, test: TestCase, errors: readonly ReportedError[]): TestResult {
  // A failed test has at least one error: the first is what stopped it.
  const error = errors[0]!;
  const place = placeOf(root, error);
  if (isAssertion(error)) {
    return {
      verdict: 'fail',
      file,
      name: test.fullName,
      // An assertion made outside every test file (in a helper's timer) has no line of the test.
      at: place?.at ?? { file, line: 1, column: 1 },
      quote: place?.quote ?? '',
      ...textOf('expected', error.expected),
      ...textOf('actual', error.actual),
      message: firstLine(error.message),
    };
  }
  return {
    verdict: 'broken',
    file,
    name: test.fullName,
    ...(place === undefined ? {} : place),
    diagnostics: diagnosticsOf(error),
  };
}

/** `expected` or `actual` as vitest serialized it, when it did. */
function textOf<K extends 'expected' | 'actual'>(key: K, value: unknown): { [P in K]?: string } {
  return typeof value === 'string' ? ({ [key]: value } as { [P in K]?: string }) : {};
}

/** The first frame of the stack inside a test file of the project, and that line of it. */
function placeOf(root: string, error: ReportedError): { at: FilePosition; quote: string } | undefined {
  for (const frame of error.stacks) {
    const file = relativeTo(root, frame.file);
    if (file.startsWith('../') || !TEST_FILE.test(file)) continue;
    // The test file that just ran, at a line its own stack names: both are there.
    const quote = readFileSync(frame.file, 'utf8').split(/\r?\n/u)[frame.line - 1]!.trim();
    return { at: { file, line: frame.line, column: frame.column }, quote };
  }
  return undefined;
}

/**
 * What a broken test says, with codes: the diagnostics of a `.fud` that did not compile, as the
 * plugin tells them, or one FUD1207 with the original message.
 */
function diagnosticsOf(error: ReportedError): readonly WireDiagnostic[] {
  return compileDiagnosticsOf(error) ?? [could(firstLine(error.message))];
}

/**
 * Whether an assertion said no: vitest's own `expect` names its error, and a matcher added with
 * `expect.extend` — jest-dom's — throws a plain `Error` that vitest marks with its name.
 */
function isAssertion(error: ReportedError): boolean {
  return ASSERTIONS.has(String(error.name)) || typeof error.__vitest_error_context__?.assertionName === 'string';
}

function could(reason: string): WireDiagnostic {
  const { code, severity, message } = FUD1207({ reason });
  return { code, severity, message, file: null, line: null, column: null };
}

function relativeTo(root: string, file: string): string {
  return posix.relative(root.replace(/\\/gu, '/'), file.replace(/\\/gu, '/'));
}

/** A terminal colour: jest-dom paints its messages, and a report is not a terminal. */
const COLOUR = /\u001b\[[0-9;]*m/gu;

function firstLine(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value);
  return text.replace(COLOUR, '').split('\n')[0]!;
}
