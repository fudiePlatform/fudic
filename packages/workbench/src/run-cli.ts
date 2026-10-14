/**
 * `fudic-workbench run [<path>…] [--browser <b>] [--workers <n>] [--json]`: runs and exits, with 0
 * only when every criterion passed. Without paths, every `.fudspec` of the current folder down.
 */

import { BROWSER_CHOICES, firstLine, type BrowserChoice } from './browser.js';
import { HumanReport } from './report.js';
import { runSpecs, type RunOptions } from './run.js';
import { isFailure } from './types.js';

/** What `run` needs of the process. */
export interface RunIo {
  write(line: string): void;
  exit(code: number): void;
  /** The folder it was started in. */
  readonly cwd: string;
}

export const RUN_USAGE = `usage: fudic-workbench run [<path>…] [--browser <${BROWSER_CHOICES.join('|')}>] [--workers <n>] [--json]`;

export interface RunArgs {
  readonly paths: readonly string[];
  readonly browser?: BrowserChoice;
  readonly workers?: number;
  readonly json: boolean;
}

export function parseRunArgs(argv: readonly string[]): RunArgs | undefined {
  const paths: string[] = [];
  let browser: BrowserChoice | undefined;
  let workers: number | undefined;
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--json') json = true;
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
  return { paths, json, ...(browser !== undefined ? { browser } : {}), ...(workers !== undefined ? { workers } : {}) };
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
