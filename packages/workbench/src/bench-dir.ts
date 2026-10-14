/**
 * The workbench folder on disk: `<project>/node_modules/.fudic-bench/<pid>/`. Emptied when the
 * workbench starts, its generated files replaced on every session load, deleted on close. The
 * folders of processes that died without closing are swept by the next one that starts.
 */

import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';

/** The two folders a plan writes into: the pages and the `Signal` hosts. */
const GENERATED = ['routes', 'components'] as const;

/** An empty folder, whatever was there before. */
export function emptyBenchDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(`${dir}/routes`, { recursive: true });
}

/** Replaces the generated files with a plan's: a criterion that is gone loses its page. */
export function writePlanFiles(dir: string, files: ReadonlyMap<string, string>): void {
  for (const folder of GENERATED) rmSync(`${dir}/${folder}`, { recursive: true, force: true });
  mkdirSync(`${dir}/routes`, { recursive: true });
  for (const [name, content] of files) {
    const path = `${dir}/${name}`;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
}

/** Deletes the folder, and `.fudic-bench` with it when no other workbench is left in it. */
export function removeBenchDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
  const parent = dirname(dir);
  // Gone already when node_modules was reinstalled with the workbench open.
  if (existsSync(parent) && readdirSync(parent).length === 0) rmSync(parent, { recursive: true, force: true });
}

/** Whether a process is alive: signal 0 checks without signalling. EPERM is alive, not ours. */
export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * Deletes the folders next to `dir` that no live workbench owns: a process that was killed, or
 * an editor that hung, never deleted its own. A name that is not a pid is the folder-per-tag
 * layout of an older workbench, and goes too.
 */
export function sweepBenchDirs(dir: string, alive: (pid: number) => boolean = isAlive): void {
  const parent = dirname(dir);
  if (!existsSync(parent)) return;
  const own = basename(dir);
  for (const name of readdirSync(parent)) {
    if (name === own) continue;
    if (/^\d+$/u.test(name) && alive(Number(name))) continue;
    rmSync(`${parent}/${name}`, { recursive: true, force: true });
  }
}
