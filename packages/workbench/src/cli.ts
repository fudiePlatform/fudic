/**
 * `fudic-workbench <file> [--port <n>] [--keep]`. Its whole protocol with whoever launched it is
 * ONE JSON line on stdout: where the shell is, or why it could not open. Then it lives until
 * stdin closes — which is what happens when its parent dies — or SIGINT arrives.
 *
 * Nothing reaches the user as a stack: a failure is a `{error}` line and exit code 1.
 */

import { firstLine } from './browser.js';
import { openWorkbench } from './open.js';
import { isFailure, type WorkbenchOptions, type WorkbenchSession } from './types.js';

/** The process, as the binary uses it; injected so `main` runs without spawning anything. */
export interface CliIo {
  write(line: string): void;
  /** Calls back once, when stdin ends or SIGINT arrives. */
  onExit(callback: () => void): void;
  exit(code: number): void;
}

export const USAGE = 'usage: fudic-workbench <file> [--port <n>] [--keep]';

export interface CliArgs {
  readonly file: string;
  readonly options: WorkbenchOptions;
}

export function parseArgs(argv: readonly string[]): CliArgs | undefined {
  let file: string | undefined;
  let port: number | undefined;
  let keep = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--keep') keep = true;
    else if (arg === '--port') {
      port = Number(argv[++i]);
      if (!Number.isInteger(port) || port < 0) return undefined;
    } else if (file === undefined && !arg.startsWith('--')) file = arg;
    else return undefined;
  }
  if (file === undefined) return undefined;
  return { file, options: { ...(port !== undefined ? { port } : {}), ...(keep ? { keep } : {}) } };
}

export async function main(argv: readonly string[], io: CliIo): Promise<void> {
  const fail = (error: { readonly code?: string; readonly message: string }) => {
    io.write(JSON.stringify({ error }));
    io.exit(1);
  };
  const args = parseArgs(argv);
  if (args === undefined) {
    fail({ message: USAGE });
    return;
  }

  let session: WorkbenchSession;
  try {
    const opened = await openWorkbench(args.file, args.options);
    if (isFailure(opened)) {
      fail({ code: opened.diagnostic.code, message: opened.diagnostic.message });
      return;
    }
    session = opened;
  } catch (error) {
    fail({ message: firstLine(error) });
    return;
  }

  io.write(JSON.stringify({ url: session.url, tag: session.tag, component: session.component, criteria: session.criteria }));
  io.onExit(() => {
    void session.close().then(() => io.exit(0));
  });
}

/** The real process behind `CliIo`. */
export function processIo(): CliIo {
  return {
    write: (line) => process.stdout.write(`${line}\n`),
    onExit(callback) {
      let called = false;
      const once = () => {
        if (called) return;
        called = true;
        callback();
      };
      process.stdin.on('end', once);
      process.on('SIGINT', once);
      process.stdin.resume();
    },
    exit: (code) => process.exit(code),
  };
}
