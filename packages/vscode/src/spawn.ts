/**
 * `ProcessPort` over `child_process.spawn` (SDD-32 §4.10, BUG-48 §4.9). The workbench speaks JSON
 * lines: the first one says where its shell is, the later ones are its messages and its answers,
 * and stdin carries commands. It also keeps the tail of stderr, which is what the tab shows when
 * the process dies on its own.
 */

import { spawn } from 'node:child_process';
import type { ProcessPort, WorkbenchProcess } from './ports.js';

/** How much of stderr is kept: the end is where the reason is. */
const STDERR_TAIL = 2000;

export const nodeProcesses: ProcessPort = {
  spawn(command, args, cwd): WorkbenchProcess {
    const child = spawn(command, [...args], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-STDERR_TAIL);
    });

    const lines: ((line: string) => void)[] = [];
    let first: ((line: string | undefined) => void) | undefined;
    const firstLine = new Promise<string | undefined>((resolve, reject) => {
      first = resolve;
      child.on('error', reject);
    });
    let out = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      out += chunk;
      for (let end = out.indexOf('\n'); end >= 0; end = out.indexOf('\n')) {
        const line = out.slice(0, end).trim();
        out = out.slice(end + 1);
        if (first !== undefined) {
          first(line);
          first = undefined;
        } else {
          for (const listener of lines) listener(line);
        }
      }
    });
    // Exiting without a line: whatever it printed, or nothing.
    child.on('close', () => first?.(out === '' ? undefined : out.trim()));

    // A closed pipe after the process died is not news: its exit already said so.
    child.stdin.on('error', () => undefined);

    return {
      firstLine,
      onLine(listener) {
        lines.push(listener);
      },
      send: (line) => void child.stdin.write(`${line}\n`),
      closeStdin: () => child.stdin.end(),
      onExit(listener) {
        child.on('close', () => listener(stderr));
      },
    };
  },
};
