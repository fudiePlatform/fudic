/**
 * The workbench folder on disk: `<project>/node_modules/.fudic-bench/<tag>/`. Emptied when the
 * workbench starts, its generated files replaced on every session load, deleted on close.
 */

import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

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
