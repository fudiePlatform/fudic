import { execFile } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { type CheckFs, nodeFileSystem, toPosix } from '@fudic/typecheck';

const run = promisify(execFile);

/** Everything the history reads from and writes to the world: files, the clock and git. */
export interface HistoryIo {
  /** The project root, absolute: what a piece's path and every hashed path are relative to. */
  readonly root: string;
  /** How files are read and links resolved: the same port the editor and the build use. */
  readonly fs: CheckFs;
  /** Adds text at the end of a file, creating it when missing. */
  append(path: string, text: string): Promise<void>;
  now(): Date;
  /** The full hash of `HEAD`, or `undefined` outside git or before the first commit. */
  head(): Promise<string | undefined>;
}

/** Asks git, in `cwd`; `undefined` when git is missing, it is not a repository or the command fails. */
export async function git(cwd: string, args: readonly string[]): Promise<string | undefined> {
  try {
    const { stdout } = await run('git', [...args], { cwd, windowsHide: true });
    return stdout.trim();
  } catch {
    return undefined;
  }
}

/** The history as it is on disk, under `root`. */
export function nodeIo(root: string = process.cwd()): HistoryIo {
  return {
    root: toPosix(root),
    fs: nodeFileSystem(),
    append: (path, text) => appendFile(path, text, 'utf8'),
    now: () => new Date(),
    head: () => git(root, ['rev-parse', '--verify', '--quiet', 'HEAD']),
  };
}
