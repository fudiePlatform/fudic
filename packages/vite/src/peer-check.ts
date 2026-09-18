/**
 * The grammar a library and its consumer have to share (SDD-43 §4.7).
 *
 * A fudic library publishes `.fud` SOURCE (§4.1), because the contract of a component —
 * props, slots, `hydratable`, `writes` — is derived from the AST and two of those four are
 * properties of the consumer's whole graph. The consequence is this: the compiler that parses
 * a library's files is the CONSUMER's. If the library uses syntax that compiler does not know,
 * what the author sees is a parse error in a file they never wrote, which is the worst
 * diagnostic there is.
 *
 * So the library declares the compiler it was written for —
 * `"peerDependencies": { "@fudic/compiler": "<range>" }` — and this compares that range with
 * the compiler the build actually resolved. One warning per LIBRARY: it is a fact of the
 * package, and saying it once per file would be the same sentence a hundred times.
 *
 * Nothing here throws, and nothing here guesses. A range this cannot read produces NO
 * diagnostic: a false warning on every build is worse than a missing one, because the first
 * thing an author learns from it is to stop reading warnings.
 */

import { dependencyChain, type PackageFs } from '@fudic/resolve';
import { FUD_LIB_PEER_MISMATCH, type FudicDiagnostic } from './diagnostics.js';

/** The package whose version decides whether a library's source can be parsed at all. */
export const COMPILER_PACKAGE = '@fudic/compiler';

/** A semantic version, prerelease and build metadata dropped. */
interface Version {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

/**
 * `FUD0762` for every fudic library of this project whose compiler range excludes the
 * compiler this build resolved.
 *
 * The libraries come from the DECLARED dependency graph, which is the same walk the index and
 * the CLI use — not from the links a document happens to write. A library in `dependencies` is
 * one this project builds with, and whether the grammar matches is true before any `.fud`
 * names it.
 */
export function checkPeers(root: string, io: PackageFs): readonly FudicDiagnostic[] {
  const resolved = resolvedCompiler(root, io);
  // No compiler to compare against — the plugin is running from somewhere this walk cannot
  // see, which is every test that builds a temp directory. Nothing can be said, so nothing is.
  if (resolved === undefined) return [];

  const diagnostics: FudicDiagnostic[] = [];
  for (const pkg of dependencyChain(root, io)) {
    if (pkg.config.kind !== 'lib') continue; // the consumer itself, and anything that is not a library
    const range = peerRange(pkg.root, io);
    if (range === undefined) continue; // declares nothing about the compiler: §4.7 is advice it did not take
    if (satisfies(resolved.version, range) !== false) continue; // in range, or a range nobody can read
    diagnostics.push({
      code: FUD_LIB_PEER_MISMATCH,
      file: pkg.name === '' ? pkg.root : pkg.name,
      message:
        `the library "${pkg.name === '' ? pkg.root : pkg.name}" was written for ` +
        `${COMPILER_PACKAGE} "${range}", and this build resolved ${resolved.version}. A library ` +
        'publishes .fud source, so that compiler is the one parsing it: what a mismatch produces ' +
        'is a syntax error in a file you did not write. Upgrade one of the two, or ask the ' +
        'library to widen its range.',
    });
  }
  return diagnostics;
}

/** The `@fudic/compiler` this project resolves: its version, and where it was found. */
function resolvedCompiler(root: string, io: PackageFs): { readonly version: string } | undefined {
  let dir = root.replace(/\\/gu, '/');
  for (;;) {
    const manifest = readManifest(`${dir}/node_modules/${COMPILER_PACKAGE}`, io);
    const version = manifest?.['version'];
    if (typeof version === 'string') return { version };
    const parent = dir.slice(0, dir.lastIndexOf('/'));
    if (parent === '' || parent === dir) return undefined;
    dir = parent;
  }
}

/** What a package says about the compiler it needs, if it says anything. */
function peerRange(packageRoot: string, io: PackageFs): string | undefined {
  const peers = readManifest(packageRoot, io)?.['peerDependencies'];
  if (peers === null || typeof peers !== 'object') return undefined;
  const range = (peers as Record<string, unknown>)[COMPILER_PACKAGE];
  return typeof range === 'string' && range.trim() !== '' ? range.trim() : undefined;
}

/** A package's manifest as a plain object, or `undefined` when there is none to read. */
function readManifest(packageRoot: string, io: PackageFs): Record<string, unknown> | undefined {
  const text = io.readFile(`${packageRoot}/package.json`);
  if (text === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed !== null && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined; // a manifest being edited says nothing
  }
}

/**
 * Whether `version` satisfies `range` — or `undefined` when this cannot tell.
 *
 * The subset is what npm writes into a `peerDependencies`: `*`, an exact version, `^`, `~`,
 * the four comparators, `x` wildcards, several of those ANDed by a space and alternatives
 * separated by `||`. Anything else — a hyphen range, a tag, a URL — is not understood, and
 * then this says so rather than guessing: the caller stays silent.
 */
export function satisfies(version: string, range: string): boolean | undefined {
  const target = parseVersion(version);
  if (target === undefined) return undefined;

  let unreadable = false;
  let read = false;
  for (const alternative of range.split('||')) {
    const comparators = comparatorsOf(alternative);
    if (comparators.length === 0) continue;
    read = true;
    let all = true;
    for (const comparator of comparators) {
      const answer = matches(target, comparator);
      if (answer === undefined) {
        unreadable = true;
        all = false;
        break;
      }
      if (!answer) {
        all = false;
        break;
      }
    }
    if (all) return true;
  }
  // Nothing matched. If part of the range could not be read — or there was nothing to read at
  // all — the honest answer is «unknown»: the version may well be allowed by the half nobody
  // here understands.
  return unreadable || !read ? undefined : false;
}

/**
 * The comparators of one alternative: whitespace-separated, with an operator written apart
 * from its version rejoined.
 *
 * `>= 1.2.0 < 2.0.0` is how npm prints what `>=1.2.0 <2.0.0` means, and splitting it on
 * whitespace alone leaves `>=` standing on its own — unreadable, and then a range everybody
 * writes would silently say nothing.
 */
function comparatorsOf(alternative: string): readonly string[] {
  const parts = alternative.trim().split(/\s+/u).filter((part) => part !== '');
  const out: string[] = [];
  for (const part of parts) {
    if (out.length > 0 && OPERATOR_ONLY.test(out[out.length - 1] as string)) {
      out[out.length - 1] += part;
      continue;
    }
    out.push(part);
  }
  return out;
}

const OPERATOR_ONLY = /^(>=|<=|>|<|\^|~|=)$/u;

/** One comparator against one version. `undefined` when the comparator is not understood. */
function matches(target: Version, comparator: string): boolean | undefined {
  if (comparator === '*' || comparator === 'x' || comparator === 'X') return true;

  // The regex cannot fail: the operator is optional and `(.+)` takes whatever is left, which
  // for a comparator that is not empty — and none of them is — always exists.
  const operator = /^(>=|<=|>|<|\^|~|=|v)?\s*(.+)$/u.exec(comparator) as RegExpExecArray;
  const bound = parsePartial(operator[2] as string);
  if (bound === undefined) return undefined;
  // A comparator over a version that is nothing but wildcards constrains nothing: `^x` and
  // `>=x` are both «any», and the ceiling the partial reports is what says so.
  if (bound.high.major === Number.MAX_SAFE_INTEGER) return true;

  switch (operator[1] ?? '') {
    case '>=':
      return compare(target, bound.low) >= 0;
    case '>':
      return compare(target, bound.low) > 0;
    case '<':
      return compare(target, bound.low) < 0;
    case '<=':
      // The partial's own ceiling is the answer: `<=1.2` is «up to the end of 1.2», and for a
      // full version that ceiling is the next patch, so this is `<= low` exactly.
      return compare(target, bound.high) < 0;
    case '^':
      return compare(target, bound.low) >= 0 && compare(target, caret(bound.low)) < 0;
    case '~':
      return compare(target, bound.low) >= 0 && compare(target, tilde(bound.low)) < 0;
    default:
      // No operator: an exact version, or a partial one — `1.2` is every patch of `1.2`.
      return compare(target, bound.low) >= 0 && compare(target, bound.high) < 0;
  }
}

/** `1.2.3` → the version. `undefined` for anything that is not three numbers or fewer. */
function parseVersion(text: string): Version | undefined {
  const partial = parsePartial(text);
  return partial === undefined ? undefined : partial.low;
}

/**
 * A possibly partial version — `1`, `1.2`, `1.2.3`, `1.x` — as the range it stands for:
 * `low` is where it starts and `high` is the first version above it.
 */
function parsePartial(text: string): { readonly low: Version; readonly high: Version } | undefined {
  // Prerelease and build metadata are dropped: this compares language versions, and a
  // `1.2.3-rc.1` is the 1.2.3 grammar. Keeping them would need the whole precedence table
  // for a distinction no fudic range has ever made.
  const core = (text.split('-')[0] as string).split('+')[0] as string;
  const parts = core.split('.');
  if (parts.length > 3) return undefined;

  const numbers: number[] = [];
  let wildcards = 0;
  for (const part of parts) {
    // An EMPTY part is not a wildcard, and that distinction is what keeps a hyphen range
    // (`1.2.3 - 2.0.0`) from being read as three comparators one of which matches everything:
    // misreading a range is a warning about a build that is fine.
    if (part === 'x' || part === 'X' || part === '*') {
      wildcards += 1;
      continue;
    }
    if (wildcards > 0 || !/^\d+$/u.test(part)) return undefined; // `1.x.3` is nobody's range
    numbers.push(Number(part));
  }

  const [major = 0, minor = 0, patch = 0] = numbers;
  const low = { major, minor, patch };
  // The ceiling of what was actually written: `1` covers all of 1.x, `1.2` all of 1.2.x, and
  // a full version covers only itself.
  const high =
    numbers.length === 0
      ? { major: Number.MAX_SAFE_INTEGER, minor: 0, patch: 0 }
      : numbers.length === 1
        ? { major: major + 1, minor: 0, patch: 0 }
        : numbers.length === 2
          ? { major, minor: minor + 1, patch: 0 }
          : { major, minor, patch: patch + 1 };
  return { low, high };
}

/**
 * The ceiling of `^`: the next version that may break.
 *
 * Below 1.0.0 that is the next MINOR (`^0.3.1` is not `0.4.0`) and below 0.1.0 the next patch,
 * which is npm's rule and matters here rather than being trivia: every fudic package is `0.0.x`
 * today, so `^0.0.1` allows exactly `0.0.1`.
 */
function caret(low: Version): Version {
  if (low.major > 0) return { major: low.major + 1, minor: 0, patch: 0 };
  if (low.minor > 0) return { major: 0, minor: low.minor + 1, patch: 0 };
  return { major: 0, minor: 0, patch: low.patch + 1 };
}

/** The ceiling of `~`: the next minor, whatever the major is. */
function tilde(low: Version): Version {
  return { major: low.major, minor: low.minor + 1, patch: 0 };
}

function compare(a: Version, b: Version): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}
