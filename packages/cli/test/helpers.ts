/**
 * Test doubles for the two filesystem seams and the command runner. The plan phase is
 * pure by construction (SDD-22 §3.2), so every command can be exercised end to end
 * without touching the disk — which is exactly what makes `--dry-run` provable.
 */

import { resolve } from 'node:path';
import type { CommandRunner, ReadIo, WriteIo } from '../src/io.js';
import type { Streams } from '../src/run.js';

const key = (path: string): string => resolve(path).replace(/\\/gu, '/');

export class MemoryFs implements ReadIo, WriteIo {
  readonly files = new Map<string, string>();

  constructor(entries: Readonly<Record<string, string>> = {}, readonly cwd = '/project') {
    for (const [path, contents] of Object.entries(entries)) this.write(resolve(cwd, path), contents);
  }

  exists(path: string): boolean {
    return this.files.has(key(path)) || this.isDirectory(path);
  }

  read(path: string): string {
    const contents = this.files.get(key(path));
    if (contents === undefined) throw new Error(`ENOENT ${path}`);
    return contents;
  }

  list(dir: string): readonly string[] {
    const prefix = `${key(dir)}/`;
    const names = new Set<string>();
    for (const path of this.files.keys()) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      const head = rest.split('/')[0];
      if (head !== undefined && head !== '') names.add(head);
    }
    return [...names];
  }

  isDirectory(path: string): boolean {
    const prefix = `${key(path)}/`;
    for (const file of this.files.keys()) if (file.startsWith(prefix)) return true;
    return false;
  }

  write(path: string, contents: string): void {
    this.files.set(key(path), contents);
  }

  /** Paths relative to `cwd`, POSIX, sorted — the shape assertions read best in. */
  paths(): readonly string[] {
    const prefix = `${key(this.cwd)}/`;
    return [...this.files.keys()].map((path) => (path.startsWith(prefix) ? path.slice(prefix.length) : path)).sort();
  }

  at(relative: string): string {
    return this.read(resolve(this.cwd, relative));
  }
}

/**
 * Records what was run and reports success, unless a status was given for a command name.
 *
 * `statuses` keys on the executable alone (`pnpm`, `git`) because that is what a test wants
 * to say: "the install fails". `null` stands for a process that never started.
 */
export class RecordingRunner implements CommandRunner {
  readonly commands: string[] = [];

  constructor(private readonly statuses: Readonly<Record<string, number | null>> = {}) {}

  run(command: string, args: readonly string[], dir: string): number | null {
    this.commands.push(`${[command, ...args].join(' ')} @ ${dir.replace(/\\/gu, '/')}`);
    return command in this.statuses ? (this.statuses[command] as number | null) : 0;
  }
}

export function captureStreams(): { streams: Streams; stdout: () => string; stderr: () => string } {
  let out = '';
  let err = '';
  return {
    streams: {
      out: (text) => {
        out += text;
      },
      err: (text) => {
        err += text;
      },
    },
    stdout: () => out,
    stderr: () => err,
  };
}
