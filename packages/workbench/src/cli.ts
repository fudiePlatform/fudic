/**
 * `fudic-workbench <file> [--port <n>] [--keep]`. Its protocol with whoever launched it is JSON
 * lines. The first one on stdout says where the shell of `<file>` is, or why it could not open;
 * after it, every message the shells receive, one per line. On stdin it reads commands, one per
 * line (`open` another component, `close` one). It lives until stdin closes — which is what
 * happens when its parent dies — or SIGINT arrives.
 *
 * Nothing reaches the user as a stack: a failure is a `{error}` line and exit code 1.
 */

import { firstLine } from './browser.js';
import { obey } from './control.js';
import { openWorkbench } from './open.js';
import { parseCommand, type BenchMessage } from './protocol.js';
import { isFailure, type WorkbenchOptions, type WorkbenchSession } from './types.js';

/** The process, as the binary uses it; injected so `main` runs without spawning anything. */
export interface CliIo {
  write(line: string): void;
  /** Calls back with every line read on stdin. */
  onLine(callback: (line: string) => void): void;
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

  // Messages flow from the first session load, before the first line can be written: they wait.
  let waiting: BenchMessage[] | undefined = [];
  const onMessage = (message: BenchMessage) => {
    if (waiting === undefined) io.write(JSON.stringify(message));
    else waiting.push(message);
  };

  let session: WorkbenchSession;
  try {
    const opened = await openWorkbench(args.file, { ...args.options, onMessage });
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
  for (const message of waiting) io.write(JSON.stringify(message));
  waiting = undefined;

  io.onLine((line) => {
    const command = parseCommand(line);
    if (command === undefined) return;
    void obey(session, command).then((answer) => {
      if (answer !== undefined) io.write(JSON.stringify(answer));
    });
  });
  io.onExit(() => {
    void session.close().then(() => io.exit(0));
  });
}

/** The real process behind `CliIo`. */
export function processIo(): CliIo {
  const lines: ((line: string) => void)[] = [];
  let buffered = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk: string) => {
    buffered += chunk;
    for (let cut = buffered.indexOf('\n'); cut >= 0; cut = buffered.indexOf('\n')) {
      const line = buffered.slice(0, cut).replace(/\r$/u, '');
      buffered = buffered.slice(cut + 1);
      for (const listener of lines) listener(line);
    }
  });
  return {
    write: (line) => process.stdout.write(`${line}\n`),
    onLine(callback) {
      lines.push(callback);
    },
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
