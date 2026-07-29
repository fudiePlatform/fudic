/**
 * Facts about the project on disk that a plan needs: which tags are taken, and how a
 * target file turns into a `FileChange`. Both go through the compiler or the injected
 * `ReadIo`; nothing here guesses from a filename.
 */

import { cliError, FUD_TARGET_EXISTS } from './diagnostics.js';
import { absolute } from './paths.js';
import { parseFud } from './parse.js';
import { walkFud, type ReadIo } from './io.js';
import type { CliError, FileChange } from './types.js';

/** Exact dependency versions the generated project pins (repo rule: no `^`, no `~`). */
export const FUDIC_VERSION = '0.0.1';
export const VITE_VERSION = '8.0.16';
/**
 * The TypeScript the generated project pins. It matters beyond the build: the language
 * server typechecks with the project's own version (SDD-24 §2), so a project that pins none
 * would get diagnostics in the editor that its CI cannot reproduce.
 */
export const TYPESCRIPT_VERSION = '5.9.3';

/**
 * Every custom element already defined in the project. Read from the AST — a component's
 * identity is its host wrapper (decision 75), not its filename, and the two can differ.
 */
export function existingTags(cwd: string, io: ReadIo): ReadonlySet<string> {
  const tags = new Set<string>();
  for (const file of walkFud(cwd, io)) {
    const doc = parseFud(io.read(absolute(cwd, file))).doc;
    if (doc.type === 'component-document' && doc.name !== '') tags.add(doc.name);
  }
  return tags;
}

export interface TargetResult {
  readonly change?: FileChange;
  readonly error?: CliError;
}

/**
 * The change that puts `contents` at `file`. An existing target is a collision (FUD0443)
 * unless `--force`, in which case it is reported as a modification — overwriting someone's
 * file and calling it a creation would hide the only fact that matters.
 */
export function targetChange(
  cwd: string,
  file: string,
  contents: string,
  force: boolean,
  io: ReadIo,
): TargetResult {
  const path = absolute(cwd, file);
  if (!io.exists(path)) return { change: { kind: 'create', path: file, contents } };
  if (!force) {
    return { error: cliError(FUD_TARGET_EXISTS, `${file} already exists; pass --force to overwrite`, file) };
  }
  return { change: { kind: 'modify', path: file, contents, before: io.read(path) } };
}
