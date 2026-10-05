/**
 * `ProcessPort` over `child_process.spawn` (SDD-32 §4.10). It reads the first line of stdout —
 * the workbench's whole protocol — and keeps the tail of stderr, which is what the tab shows when
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

    const firstLine = new Promise<string | undefined>((resolve, reject) => {
      let out = '';
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        out += chunk;
        const end = out.indexOf('\n');
        if (end >= 0) resolve(out.slice(0, end).trim());
      });
      child.on('error', reject);
      // Exiting without a line: whatever it printed, or nothing.
      child.on('close', () => resolve(out === '' ? undefined : out.trim()));
    });

    // A closed pipe after the process died is not news: its exit already said so.
    child.stdin.on('error', () => undefined);

    return {
      firstLine,
      closeStdin: () => child.stdin.end(),
      onExit(listener) {
        child.on('close', () => listener(stderr));
      },
    };
  },
};
