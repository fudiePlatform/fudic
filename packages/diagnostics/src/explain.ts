/**
 * A code's explanation (`FUDnnnn.md`): where it is on disk, for the editor's "Explain" action,
 * and what it says, read as data.
 *
 * A subpath of its own (`@fudic/diagnostics/explain`) because it needs Node: nothing that runs
 * in a browser should reach it through the main entry.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FudCode, Severity } from './types.js';

/** A code's `.md`, split into its parts. */
export interface Explanation {
  readonly code: FudCode;
  readonly title: string;
  readonly severity: Severity | 'retired';
  /** The body lines joined with a space. */
  readonly why: string;
  /** The text after `**Fix:**` (live codes). */
  readonly fix?: string;
  /** The text after `**Replaced by:**` (retired codes). */
  readonly replacedBy?: string;
}

/**
 * The folder the explanations ship in. The `.md` files are published as `src/codes/*.md`, and
 * this module runs from `src/` in the workspace and from `dist/src/` once built: `./codes/`
 * from the former, `../../src/codes/` from the latter — both are the package's `src/codes/`.
 * Bundled into the editor's server, it is `./codes/` beside the bundle, where the extension's
 * build copies them. `from` is the module's own URL; a test passes another.
 */
export function explanationsDir(from: string = import.meta.url): string {
  const here = fileURLToPath(new URL('.', from));
  const built = /[\\/]dist[\\/]src[\\/]?$/.test(here);
  return fileURLToPath(new URL(built ? '../../src/codes/' : './codes/', from));
}

/** The explanation file of one code, in `dir` (by default, the package's own). */
export function explanationFile(code: FudCode, dir: string = explanationsDir()): string {
  return join(dir, `${code}.md`);
}

/** Title, severity, body and the closing `**Fix:**` or `**Replaced by:**` line, in that order. */
const SHAPE =
  /^# FUD\d{4} — (.+)\n\*\*(error|warning|info|hint|retired)\*\*\n\n([\s\S]*?)(?:\n\*\*(Fix|Replaced by):\*\* (.*))?$/u;

/** Reads and splits a code's .md. Undefined for a code with no .md. Never throws. */
export function explain(code: string, dir: string = explanationsDir()): Explanation | undefined {
  // The code may come from a caller that is not the compiler: it never becomes a path unchecked.
  if (!/^FUD\d{4}$/u.test(code)) return undefined;
  let text: string;
  try {
    text = readFileSync(explanationFile(code as FudCode, dir), 'utf8');
  } catch {
    return undefined;
  }
  const m = SHAPE.exec(text.replace(/\r\n/gu, '\n').trimEnd());
  if (m === null) return undefined;
  const base = {
    code: code as FudCode,
    title: m[1]!,
    severity: m[2] as Severity | 'retired',
    why: m[3]!.replace(/\n/gu, ' '),
  };
  if (m[4] === undefined) return base;
  return m[4] === 'Fix' ? { ...base, fix: m[5]! } : { ...base, replacedBy: m[5]! };
}
