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
  readonly message?: string;
  readonly expected?: unknown;
  readonly actual?: unknown;
  readonly stacks?: readonly { readonly file: string; readonly line: number; readonly column: number }[];
  readonly fudic?: unknown;
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

async function run(root: string, options: RunTestsOptions, started: number): Promise<TestReport> {
  const chosen = options.failing === true ? lastFailing(root, options) : options;
  // Everything passed last time: there is nothing to run again.
  if (chosen === null) return reportOf(root, [], Date.now() - started);
  const { paths, names } = chosen;
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
    ...(names !== undefined && names.length > 0 ? { testNamePattern: namePattern(names) } : {}),
  });
  try {
    await vitest.start(paths === undefined ? [] : [...paths]);
  } finally {
    await vitest.close();
  }
  return reportOf(root, modules, Date.now() - started);
}

/**
 * What did not pass last time: its files, and its names unless a file did not load — then that
 * file runs whole, and so does every file of the run, since vitest has one name filter for all.
 * With no report before, everything; with one where everything passed, null: nothing.
 */
function lastFailing(
  root: string,
  options: RunTestsOptions,
): { paths?: readonly string[]; names?: readonly string[] } | null {
  const last = readLast(root);
  if (last === undefined) return options;
  if (last.tests.length === 0) return null;
  const files = [...new Set(last.tests.map((test) => test.file))];
  const whole = last.tests.some((test) => test.name === null);
  const failed = last.tests.flatMap((test) => (test.name === null ? [] : [test.name]));
  return { paths: files, ...(whole ? {} : { names: failed }) };
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
  const sorted = [...modules].sort((a, b) => (a.moduleId < b.moduleId ? -1 : a.moduleId > b.moduleId ? 1 : 0));
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
  const error = errors[0] ?? {};
  const place = placeOf(root, error);
  if (ASSERTIONS.has(error.name ?? '')) {
    // An assertion always points at a line of the test: it was thrown there.
    return {
      verdict: 'fail',
      file,
      name: test.fullName,
      at: place?.at ?? { file, line: 1, column: 1 },
      quote: place?.quote ?? '',
      ...textOf('expected', error.expected),
      ...textOf('actual', error.actual),
      message: firstLine(error.message ?? ''),
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
  for (const frame of error.stacks ?? []) {
    const file = relativeTo(root, frame.file);
    if (file.startsWith('../') || file.includes('node_modules/') || !TEST_FILE.test(file)) continue;
    const quote = lineOf(frame.file, frame.line);
    if (quote === undefined) continue;
    return { at: { file, line: frame.line, column: frame.column }, quote };
  }
  return undefined;
}

function lineOf(file: string, line: number): string | undefined {
  try {
    return readFileSync(file, 'utf8').split(/\r?\n/u)[line - 1]?.trim();
  } catch {
    return undefined;
  }
}

/**
 * What a broken test says, with codes: the diagnostics of a `.fud` that did not compile as the
 * plugin carried them, or one FUD1207 with the original message.
 */
function diagnosticsOf(error: ReportedError): WireDiagnostic[] {
  const fudic = error.fudic;
  if (typeof fudic === 'object' && fudic !== null && Array.isArray((fudic as { diagnostics?: unknown }).diagnostics)) {
    return (fudic as { diagnostics: WireDiagnostic[] }).diagnostics;
  }
  return [could(firstLine(error.message ?? String(error.name ?? 'unknown error')))];
}

function could(reason: string): WireDiagnostic {
  const { code, severity, message } = FUD1207({ reason });
  return { code, severity, message, file: null, line: null, column: null };
}

function relativeTo(root: string, file: string): string {
  return posix.relative(root.replace(/\\/gu, '/'), file.replace(/\\/gu, '/'));
}

function firstLine(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value);
  return text.split('\n')[0]!;
}
