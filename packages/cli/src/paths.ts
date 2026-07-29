/**
 * Path arithmetic, always in POSIX form. Every path the CLI puts INSIDE a file (an
 * `href`) is relative to the file that holds it, with an explicit `./` and the `.fud`
 * extension; every path the CLI reports or plans is relative to `cwd`. Windows separators
 * never reach a generated file.
 */

import { relative as nodeRelative, dirname as nodeDirname, resolve as nodeResolve } from 'node:path';

export function toPosix(path: string): string {
  return path.replace(/\\/gu, '/');
}

export function dirname(path: string): string {
  return toPosix(nodeDirname(path));
}

/** Join POSIX-style, dropping empty segments (so `join('', 'a')` is `a`, not `/a`). */
export function joinPosix(...parts: readonly string[]): string {
  return parts
    .filter((part) => part !== '' && part !== '.')
    .map(toPosix)
    .join('/')
    .replace(/\/{2,}/gu, '/');
}

/** An `href` from `fromFile` to `toFile`, both relative to the same root. */
export function hrefBetween(fromFile: string, toFile: string): string {
  const rel = toPosix(nodeRelative(nodeDirname(fromFile), toFile));
  return rel.startsWith('.') ? rel : `./${rel}`;
}

/** Resolve a `cwd`-relative path to an absolute one. */
export function absolute(cwd: string, relPath: string): string {
  return nodeResolve(cwd, relPath);
}

/** Resolve an `href` written inside `fromFile` back to a `cwd`-relative path. */
export function resolveHref(fromFile: string, href: string): string {
  return toPosix(nodeRelative('.', nodeResolve(nodeDirname(fromFile), href)));
}
