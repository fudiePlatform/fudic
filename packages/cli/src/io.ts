/**
 * The filesystem seam. Reading and writing are two interfaces, not one, because the plan
 * phase must be incapable of writing (SDD-22 §3.2) — that is enforced here by the type,
 * not by discipline. Tests inject in-memory implementations; the binary injects Node.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';

/** What the `plan*` functions may do: look, never touch. */
export interface ReadIo {
  exists(path: string): boolean;
  read(path: string): string;
  /** Entry names of a directory; `[]` when it does not exist. */
  list(dir: string): readonly string[];
  isDirectory(path: string): boolean;
}

/** What `apply` may do. */
export interface WriteIo {
  write(path: string, contents: string): void;
}

/** External processes: `pnpm install`, `git init`. Injected so tests never spawn. */
export interface CommandRunner {
  run(command: string, args: readonly string[], dir: string): void;
}

export function nodeReadIo(): ReadIo {
  return {
    exists: (path) => existsSync(path),
    read: (path) => readFileSync(path, 'utf8'),
    list: (dir) => (existsSync(dir) ? readdirSync(dir) : []),
    isDirectory: (path) => existsSync(path) && statSync(path).isDirectory(),
  };
}

export function nodeWriteIo(): WriteIo {
  return {
    write: (path, contents) => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, contents, 'utf8');
    },
  };
}

export function nodeCommandRunner(): CommandRunner {
  return {
    run: (command, args, dir) => {
      mkdirSync(dir, { recursive: true });
      // `shell: true` on Windows: `pnpm`/`git` are `.cmd` shims there. stdio inherited so
      // the user sees the install output — the CLI never asks anything itself (§4.1).
      spawnSync(command, [...args], { cwd: dir, stdio: 'inherit', shell: process.platform === 'win32' });
    },
  };
}

/** Directories a project scan never descends into. */
const SKIPPED = new Set(['node_modules', 'dist', '.git', 'coverage', '.vite']);

/**
 * Every `.fud` under `root`, as paths relative to it with POSIX separators. Used to find
 * the tags already taken (FUD0441) and the layouts available to a new page.
 */
export function walkFud(root: string, io: ReadIo): readonly string[] {
  const found: string[] = [];
  const visit = (dir: string, prefix: string): void => {
    for (const entry of io.list(dir)) {
      if (SKIPPED.has(entry)) continue;
      const full = join(dir, entry);
      const rel = prefix === '' ? entry : `${prefix}/${entry}`;
      if (io.isDirectory(full)) visit(full, rel);
      else if (entry.endsWith('.fud')) found.push(rel);
    }
  };
  if (io.isDirectory(root)) visit(root, '');
  return found.sort();
}
