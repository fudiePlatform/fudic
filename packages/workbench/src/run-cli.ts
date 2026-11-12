/**
 * `fudic-workbench run [<path>…] [--browser <b>] [--workers <n>] [--json]`: runs and exits, with 0
 * only when every criterion passed. Without paths, every `.fudspec` of the current folder down.
 *
 * `fudic-workbench record [<path>…] [--criterion <id>]…`: the same run, of pages and flows,
 * against the real server, and what it answered written into their fixtures (SDD-82 §3.9).
 */

import { posix } from 'node:path';
import { FUD0976 } from '@fudic/diagnostics';
import { BROWSER_CHOICES, firstLine, type BrowserChoice } from './browser.js';
import { HumanReport } from './report.js';
import { runSpecs, type RunOptions } from './run.js';
import { slashes } from './target.js';
import { isFailure } from './types.js';

/** What `run` needs of the process. */
export interface RunIo {
  write(line: string): void;
  exit(code: number): void;
  /** The folder it was started in. */
  readonly cwd: string;
}

export const RUN_USAGE = `usage: fudic-workbench run [<path>…] [--browser <${BROWSER_CHOICES.join('|')}>] [--workers <n>] [--json] [--pass-with-no-specs] [--failing]`;

/** The code of "nothing to run", taken from the code itself: no package spells a code by hand. */
const NOTHING_TO_RUN = FUD0976({ where: '' }).code;

export interface RunArgs {
  readonly paths: readonly string[];
  readonly browser?: BrowserChoice;
  readonly workers?: number;
  readonly json: boolean;
  /**
   * Nothing to run exits 0 instead of FUD0976 (BUG-50 §4.2): what a project just created runs,
   * before it has its first `.fudspec`. Without it, nothing to run stays an error, so a CI that
   * lost its specs does not pass.
   */
  readonly passWithNoSpecs: boolean;
  /** Only what did not pass in the last report. */
  readonly failing: boolean;
}

export function parseRunArgs(argv: readonly string[]): RunArgs | undefined {
  const paths: string[] = [];
  let browser: BrowserChoice | undefined;
  let workers: number | undefined;
  let json = false;
  let passWithNoSpecs = false;
  let failing = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--json') json = true;
    else if (arg === '--pass-with-no-specs') passWithNoSpecs = true;
    else if (arg === '--failing') failing = true;
    else if (arg === '--workers') {
      workers = Number(argv[++i]);
      if (!Number.isInteger(workers) || workers < 1) return undefined;
    } else if (arg === '--browser') {
      browser = BROWSER_CHOICES.find((choice) => choice === argv[i + 1]);
      i++;
      if (browser === undefined) return undefined;
    } else if (arg.startsWith('--')) return undefined;
    else paths.push(arg);
  }
  return { paths, json, passWithNoSpecs, failing, ...(browser !== undefined ? { browser } : {}), ...(workers !== undefined ? { workers } : {}) };
}

export async function runMain(argv: readonly string[], io: RunIo): Promise<void> {
  const args = parseRunArgs(argv);
  if (args === undefined) {
    io.write(RUN_USAGE);
    io.exit(1);
    return;
  }
  const human = new HumanReport(io.write);
  const json = (value: unknown) => io.write(JSON.stringify(value));
  const options: RunOptions = {
    root: io.cwd,
    ...(args.failing ? { failing: true } : {}),
    ...(args.browser !== undefined ? { browser: args.browser } : {}),
    ...(args.workers !== undefined ? { workers: args.workers } : {}),
    ...(args.json
      ? {
          onMessage: json,
          onDiagnostic: (d) => json({ v: 2, type: 'diagnostic', code: d.code, severity: d.severity, message: d.message }),
        }
      : {
          onMessage: (m) => human.message(m),
          onDone: (tag) => human.done(tag),
          onDiagnostic: (d) => human.diagnostic(d),
        }),
  };

  try {
    const summary = await runSpecs(args.paths, options);
    if (isFailure(summary)) {
      const { code, severity, message } = summary.diagnostic;
      if (args.passWithNoSpecs && code === NOTHING_TO_RUN) {
        if (args.json) json({ v: 2, type: 'summary', pass: 0, fail: 0, error: 0, ms: 0, browser: null });
        else io.write('no .fudspec yet: nothing to run');
        io.exit(0);
        return;
      }
      if (args.json) json({ v: 2, type: 'diagnostic', code, severity, message });
      else human.diagnostic(summary.diagnostic);
      io.exit(1);
      return;
    }
    if (args.json) {
      const { pass, fail, error, ms, browser } = summary;
      json({ v: 2, type: 'summary', pass, fail, error, ms, browser });
    } else {
      human.summary(summary);
    }
    io.exit(summary.fail + summary.error === 0 ? 0 : 1);
  } catch (error) {
    io.write(`error ${firstLine(error)}`);
    io.exit(1);
  }
}

export const RECORD_USAGE = `usage: fudic-workbench record [<path>…] [--criterion <id>]… [--browser <${BROWSER_CHOICES.join('|')}>] [--json]`;

export interface RecordArgs {
  readonly paths: readonly string[];
  /** Only these criteria; all of them when empty. */
  readonly criteria: readonly string[];
  readonly browser?: BrowserChoice;
  readonly json: boolean;
}

export function parseRecordArgs(argv: readonly string[]): RecordArgs | undefined {
  const paths: string[] = [];
  const criteria: string[] = [];
  let browser: BrowserChoice | undefined;
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--json') json = true;
    else if (arg === '--criterion') {
      const id = argv[++i];
      if (id === undefined || id.startsWith('--')) return undefined;
      criteria.push(id);
    } else if (arg === '--browser') {
      browser = BROWSER_CHOICES.find((choice) => choice === argv[i + 1]);
      i++;
      if (browser === undefined) return undefined;
    } else if (arg.startsWith('--')) return undefined;
    else paths.push(arg);
  }
  return { paths, criteria, json, ...(browser !== undefined ? { browser } : {}) };
}

/**
 * `fudic-workbench record`: the criteria of the pages and flows named, run against the real
 * server, and what it answered written into their fixtures (SDD-82 §3.9). Exits 0 when every
 * criterion was recorded.
 */
export async function recordMain(argv: readonly string[], io: RunIo): Promise<void> {
  const args = parseRecordArgs(argv);
  if (args === undefined) {
    io.write(RECORD_USAGE);
    io.exit(1);
    return;
  }
  const human = new HumanReport(io.write);
  const json = (value: unknown) => io.write(JSON.stringify(value));
  const relative = (path: string) => posix.relative(slashes(io.cwd), path);
  try {
    const summary = await runSpecs(args.paths, {
      root: io.cwd,
      record: true,
      ...(args.criteria.length > 0 ? { criteria: args.criteria } : {}),
      ...(args.browser !== undefined ? { browser: args.browser } : {}),
      onDiagnostic: (d) => (args.json ? json({ v: 2, type: 'diagnostic', code: d.code, severity: d.severity, message: d.message }) : human.diagnostic(d)),
    });
    if (isFailure(summary)) {
      const { code, severity, message } = summary.diagnostic;
      if (args.json) json({ v: 2, type: 'diagnostic', code, severity, message });
      else human.diagnostic(summary.diagnostic);
      io.exit(1);
      return;
    }
    const { recorded, skipped } = summary.recording!;
    for (const one of recorded) {
      if (args.json) json({ v: 2, type: 'recorded', spec: relative(one.spec), id: one.id, data: one.data, calls: one.calls });
      else io.write(`recorded ${relative(one.spec)} ${one.id}: data [${one.data.join(', ')}] · calls [${one.calls.join(', ')}]`);
    }
    for (const one of skipped) {
      if (args.json) json({ v: 2, type: 'skipped', spec: relative(one.spec), id: one.id, reason: one.reason });
      else io.write(`not recorded ${relative(one.spec)} ${one.id}: ${one.reason}`);
    }
    if (args.json) json({ v: 2, type: 'summary', recorded: recorded.length, skipped: skipped.length, error: summary.error });
    else io.write(`${recorded.length} recorded, ${skipped.length} not recorded`);
    io.exit(skipped.length === 0 && summary.error === 0 && recorded.length > 0 ? 0 : 1);
  } catch (error) {
    io.write(`error ${firstLine(error)}`);
    io.exit(1);
  }
}
