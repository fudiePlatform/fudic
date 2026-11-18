/**
 * The workbench folder on disk: `<project>/node_modules/.fudic-bench/<pid>/`. Emptied when the
 * workbench starts, its generated files replaced on every session load, deleted on close. The
 * folders of processes that died without closing are swept by the next one that starts.
 */

import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';

/** The file name of the bench layout, at the top of the folder, beside `routes/`. */
export const BENCH_LAYOUT_FILE = '_bench-layout.fud';

/**
 * The layout every page of the bench links (SDD-88): the smallest document there is, so the body
 * of a page holds the mounted component and nothing else. Fixed, and not a route: it lies outside
 * `routes/`.
 */
export const BENCH_LAYOUT =
  '<!DOCTYPE html>\n<html>\n  <head>\n    <meta charset="utf-8">\n    <script type="module" src="fudic:runtime"></script>\n    @RenderHead()\n  </head>\n  <body>\n@RenderBody()\n  </body>\n</html>\n';

/** An empty folder, whatever was there before, with the bench layout in it. */
export function emptyBenchDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(`${dir}/routes`, { recursive: true });
  writeFileSync(`${dir}/${BENCH_LAYOUT_FILE}`, BENCH_LAYOUT);
}

/**
 * Deletes what one component's plan wrote: its bare page, its criteria's pages and its hosts.
 * The folder serves every component the process has open, so it is cleared by tag.
 */
export function removeTagFiles(dir: string, tag: string): void {
  for (const path of [`routes/${tag}.fud`, `routes/${tag}`, `components/${tag}`]) {
    rmSync(`${dir}/${path}`, { recursive: true, force: true });
  }
}

/** Replaces a component's generated files with its plan's: a criterion that is gone loses its page. */
export function writePlanFiles(dir: string, tag: string, files: ReadonlyMap<string, string>): void {
  removeTagFiles(dir, tag);
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
