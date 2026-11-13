/**
 * How a project reports each code: the `diagnostics` of its `fudic.json`, and the `fud-disable`
 * comments of each file. The severity still belongs to the code; the policy only changes how it
 * is reported, and says so in the message, so nobody looks in the code's explanation for a
 * severity their project does not use. An error is never lowered nor silenced.
 */

import { FUD1523 } from './codes/FUD1523.js';
import type { LineMap } from './linemap.js';
import { readSuppressions, type SourceComment, type Suppression } from './suppressions.js';
import type { FudCode, FudDiagnostic, Severity, SourceDiagnostic } from './types.js';

export type PolicyLevel = 'off' | Severity;

export interface Policy {
  readonly codes: ReadonlyMap<FudCode, PolicyLevel>;
  /** What every code whose default is warning becomes, unless it has its own entry. */
  readonly warnings?: PolicyLevel;
}

export interface PolicyResult<D extends FudDiagnostic = FudDiagnostic> {
  readonly diagnostics: readonly D[];
  /** The suppressions, each with only the codes that silenced nothing; absent when all did. */
  readonly unused: readonly Suppression[];
}

/**
 * What a file's diagnostics become under its project's policy and its own comments.
 *
 * Pass the file's diagnostics, all of them: a suppression whose code is not among them is
 * reported as `unused`. A diagnostic located in ANOTHER file obeys the policy, but not these
 * comments, which are not that file's: one is this file's when it names no `file`, or names
 * `self`, the path of the file the comments were read from.
 */
export function applyPolicy<D extends FudDiagnostic>(
  diagnostics: readonly D[],
  policy: Policy | null,
  suppressions: readonly Suppression[],
  lines: LineMap,
  self?: string,
): PolicyResult<D> {
  const used = suppressions.map(() => new Set<FudCode>());
  const out: D[] = [];
  const mine = (file: string | undefined): boolean =>
    file === undefined || (self !== undefined && slashed(file) === slashed(self));
  for (const diagnostic of diagnostics) {
    if (diagnostic.severity === 'error') {
      out.push(diagnostic);
      continue;
    }
    const silencer = mine(diagnostic.file) ? silencedBy(diagnostic, suppressions, lines) : -1;
    if (silencer >= 0) {
      used[silencer]!.add(diagnostic.code);
      continue;
    }
    const level = reportedLevel(diagnostic.code, diagnostic.severity, policy);
    if (level === 'off') continue;
    out.push(level === diagnostic.severity ? diagnostic : relevel(diagnostic, level));
  }
  const unused: Suppression[] = [];
  suppressions.forEach((suppression, i) => {
    const codes = suppression.codes.filter((code) => !used[i]!.has(code));
    if (codes.length > 0) unused.push({ ...suppression, codes });
  });
  return { diagnostics: out, unused };
}

/** A path with forward slashes: Windows and POSIX spellings of one file are one file. */
function slashed(path: string): string {
  return path.replace(/\\/gu, '/');
}

/** The index of the first suppression that covers `diagnostic`, or -1. */
function silencedBy(diagnostic: FudDiagnostic, suppressions: readonly Suppression[], lines: LineMap): number {
  const line = diagnostic.span === undefined ? undefined : lines.positionAt(diagnostic.span.start).line;
  return suppressions.findIndex(
    (s) => s.codes.includes(diagnostic.code) && (s.scope === 'file' || (line !== undefined && s.line === line)),
  );
}

/**
 * How a project reports a code whose own severity is `severity`: the code's own entry; else, for a
 * warning, the `warnings` entry; else its own severity. An error stays an error, whatever the policy
 * says. What `applyPolicy` applies, and what the editor shows over a code in a `fud-disable` comment.
 */
export function reportedLevel(code: FudCode, severity: Severity, policy: Policy | null): PolicyLevel {
  if (severity === 'error') return 'error';
  const own = policy?.codes.get(code);
  if (own !== undefined) return own;
  if (severity === 'warning' && policy?.warnings !== undefined) return policy.warnings;
  return severity;
}

function relevel<D extends FudDiagnostic>(diagnostic: D, level: Severity): D {
  return {
    ...diagnostic,
    severity: level,
    message: `${diagnostic.message} (${diagnostic.severity} by default; ${level} in this project)`,
  };
}

export interface GovernOptions {
  /**
   * Whether `diagnostics` is everything said about the file, so a comment that silenced nothing
   * can be reported (`FUD1523`). A caller that holds only part of them leaves it out.
   */
  readonly complete?: boolean;
  /** The path of the file, for the diagnostics that name it (see `applyPolicy`). */
  readonly file?: string;
}

/**
 * The whole of what a person sees about one file: its comments read, the policy applied to its
 * diagnostics and to what the comments themselves had to say and, when the list is complete, a
 * `FUD1523` for each comment that silenced nothing.
 */
export function govern<D extends FudDiagnostic>(
  diagnostics: readonly D[],
  policy: Policy | null,
  comments: readonly SourceComment[],
  lines: LineMap,
  options: GovernOptions = {},
): readonly (D | SourceDiagnostic)[] {
  const read = readSuppressions(comments, lines);
  const applied = applyPolicy([...diagnostics, ...read.diagnostics], policy, read.suppressions, lines, options.file);
  if (options.complete !== true) return applied.diagnostics;
  const unused = applied.unused.map((s) => FUD1523({ span: s.span, codes: s.codes, scope: s.scope }));
  return [...applied.diagnostics, ...applyPolicy(unused, policy, [], lines).diagnostics];
}
