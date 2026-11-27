/**
 * What `fudic add` and the generators that need a module share (BUG-50 §4.6): the optional
 * modules of fudic, the edit that makes a project depend on one, and the install that follows.
 */

import { FUDIC_VERSION } from '../project.js';
import { joinPosix, relativeTo } from '../paths.js';
import { declareDependency } from './link.js';
import { workspaceRoot } from './discover.js';
import type { ReadIo } from '../io.js';
import type { FileChange, PlanCommand } from '../types.js';
import type { Target } from './target.js';

/** The optional modules `fudic add` knows, by the name it takes. */
export const MODULES: Readonly<Record<string, string>> = {
  di: '@fudic/di',
  forms: '@fudic/forms',
  http: '@fudic/http',
  i18n: '@fudic/i18n',
};

/** The folder name of a project: how `--project` names it, and how the reports do. */
export function projectName(target: Target): string {
  return target.path.slice(target.path.lastIndexOf('/') + 1);
}

/** The edit that makes `target` depend on `pkg` at `version`; nothing when it already does. */
export function dependOn(target: Target, pkg: string, version: string, io: ReadIo): Extract<FileChange, { kind: 'modify' }> | undefined {
  return declareDependency(joinPosix(target.path, 'package.json'), joinPosix(target.dir, 'package.json'), pkg, version, io);
}

/** The edit that takes `pkg` out of the `dependencies` of `target`; nothing when it is not there. */
export function dropDependency(target: Target, pkg: string, io: ReadIo): FileChange | undefined {
  const path = joinPosix(target.path, 'package.json');
  if (!io.exists(path)) return undefined;
  const before = io.read(path);
  const contents = withoutDependency(before, pkg);
  return contents === undefined ? undefined : { kind: 'modify', path: joinPosix(target.dir, 'package.json'), contents, before };
}

/**
 * The text of a `package.json` without `pkg` in its `dependencies`; `undefined` when it is not
 * there. Written into the text like `dependOn`: the line goes, and the comma that joined it.
 */
export function withoutDependency(before: string, pkg: string): string | undefined {
  const dependencies = (JSON.parse(before) as { dependencies?: Record<string, unknown> }).dependencies;
  if (dependencies === undefined || !(pkg in dependencies)) return undefined;
  // The block holds strings only, so its first `}` closes it.
  const start = /"dependencies"\s*:\s*\{/u.exec(before)!.index;
  const end = before.indexOf('}', start);
  const key = JSON.stringify(pkg).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const block = before.slice(start, end);
  // Followed by a comma, the line and its comma go; the last one takes the comma before it.
  const followed = new RegExp(`\\s*${key}\\s*:\\s*"[^"]*"\\s*,`, 'u');
  const last = new RegExp(`,?\\s*${key}\\s*:\\s*"[^"]*"`, 'u');
  const edited = followed.test(block) ? block.replace(followed, '') : block.replace(last, '');
  return `${before.slice(0, start)}${edited}${before.slice(end)}`;
}

/** `dependOn` a module of fudic, at the version this CLI pins. */
export function dependOnModule(target: Target, pkg: string, io: ReadIo): FileChange | undefined {
  return dependOn(target, pkg, FUDIC_VERSION, io);
}

/** The install after it: the workspace's, from its root, or the project's own. */
export function installFor(target: Target, cwd: string, io: ReadIo): PlanCommand {
  const root = workspaceRoot(target.path, io) ?? target.path;
  return { command: 'pnpm', args: ['install'], dir: relativeTo(cwd, root) || '.', quiet: true };
}

/** The line a generator adds when it had to add the module it needs (BUG-50 §6.11, §6.12). */
export function addedLine(pkg: string, project: string): string {
  return `  Added ${pkg} ${FUDIC_VERSION} to ${project} (it was not there)`;
}
