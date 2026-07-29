/**
 * Path arithmetic for the workspace index and the `href` services (SDD-24 §4.2, §4.5).
 *
 * POSIX-shaped strings, not `node:path`: the server keys everything by URI, an editor on
 * Windows sends both separators for the same file, and `href` in a `.fud` is always written
 * with forward slashes. Normalizing once, here, is what makes `index.get(path)` a map lookup
 * instead of a filesystem question.
 */

/** Same file, one spelling: forward slashes, no trailing one. */
export function toPosix(path: string): string {
  const forward = path.replace(/\\/g, '/');
  return forward.length > 1 && forward.endsWith('/') ? forward.slice(0, -1) : forward;
}

/** The root a path is anchored at: `'/'`, `'C:/'`, or `''` when it is relative. */
function rootOf(path: string): string {
  const drive = /^[A-Za-z]:\//.exec(path);
  if (drive !== null) return drive[0];
  return path.startsWith('/') ? '/' : '';
}

/** Resolve `.` and `..`; a `..` that escapes a relative path is kept, not dropped. */
function normalize(path: string): string {
  const root = rootOf(path);
  const out: string[] = [];

  for (const segment of path.slice(root.length).split('/')) {
    if (segment === '' || segment === '.') continue;
    const last = out[out.length - 1];
    if (segment === '..' && last !== undefined && last !== '..') {
      out.pop();
      continue;
    }
    if (segment === '..' && root !== '') continue; // `..` above the root is the root
    out.push(segment);
  }
  return root + out.join('/');
}

/** The directory a file lives in, without trailing slash. `''` when there is none. */
export function dirName(path: string): string {
  const posix = toPosix(path);
  const cut = posix.lastIndexOf('/');
  if (cut === -1) return '';
  return cut === 0 ? '/' : posix.slice(0, cut);
}

/** The last segment of a path. */
export function baseName(path: string): string {
  const posix = toPosix(path);
  return posix.slice(posix.lastIndexOf('/') + 1);
}

/**
 * Where an `href` written inside `fromFile` points at.
 *
 * The `href` is relative to the file that contains it, exactly as TypeScript resolves the
 * synthetic imports of SDD-23 — the two must agree, or the editor and the checker would
 * disagree about which component a tag is.
 */
export function resolveFrom(fromFile: string, href: string): string {
  const target = toPosix(href);
  if (rootOf(target) !== '') return normalize(target);
  const dir = dirName(fromFile);
  return normalize(dir === '' ? target : `${dir}/${target}`);
}

/**
 * How `target` is written as an `href` inside `fromFile`.
 *
 * Always explicitly relative (`./` or `../`): a bare `x.fud` means a package to TypeScript
 * but a sibling file to the user, and the completion must offer what actually resolves.
 */
export function relativeHref(fromFile: string, target: string): string {
  const fromDir = dirName(fromFile);
  const from = fromDir === '' ? [] : fromDir.split('/');
  const to = toPosix(target).split('/');

  let shared = 0;
  while (shared < from.length && shared < to.length && from[shared] === to[shared]) shared++;

  const up = from.length - shared;
  const rest = to.slice(shared).join('/');
  return up === 0 ? `./${rest}` : `${'../'.repeat(up)}${rest}`;
}
