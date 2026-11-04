/**
 * A diagnostic as a model reads it: `file:line:column` and the line it starts on, never offsets,
 * and the why and the fix of each fudic code once per answer instead of once per diagnostic.
 */

import { isAbsolute, relative } from 'node:path';
import { LineMap, type Severity, type Span } from '@fudic/diagnostics';
import { explain } from '@fudic/diagnostics/explain';

/**
 * A problem a tool reports: a fudic diagnostic, or one of a project check — whose code may be
 * TypeScript's, `TS2322`. Whether it is fixable is the check's to say.
 */
export interface Problem {
  readonly code: string;
  readonly severity: Severity;
  readonly message: string;
  /** Absolute; a path as the caller wrote it when it is not. */
  readonly file?: string;
  readonly span?: Span;
  readonly fixable?: boolean;
  /** The titles of its repairs, when there are several and the choice is the caller's. */
  readonly options?: readonly string[];
}

export interface OutDiagnostic {
  readonly code: string;
  readonly severity: Severity;
  readonly message: string;
  /** `src/components/app-card/app-card.fud:15:3`, relative to the project and 1-based. */
  readonly at?: string;
  /** The line the problem starts on, without its indentation. */
  readonly quote?: string;
  /** One repair, and only one, that the editor would offer. */
  readonly fixable?: boolean;
  /** The titles of its repairs, when there are several. */
  readonly options?: readonly string[];
}

export interface CodeText {
  readonly title: string;
  readonly why: string;
  readonly fix?: string;
}

/** Reads a file of the project; undefined when it cannot. */
export type ReadSource = (file: string) => string | undefined;

function posix(path: string): string {
  return path.replace(/\\/gu, '/');
}

/** The diagnostic as an answer carries it. A span without the file's text keeps only the file. */
export function outDiagnostic(d: Problem, root: string, read: ReadSource): OutDiagnostic {
  const base = { code: d.code, severity: d.severity, message: d.message };
  const place = placeOf(d, root, read);
  return {
    ...base,
    ...place,
    ...(d.fixable !== undefined ? { fixable: d.fixable } : {}),
    ...(d.options !== undefined ? { options: d.options } : {}),
  };
}

/**
 * `at` and `quote` of a place — a problem, a symbol —, as far as the file and its text allow:
 * relative to the project, 1-based, never an offset.
 */
export function placeOf(d: { readonly file?: string; readonly span?: Span }, root: string, read: ReadSource): { at?: string; quote?: string } {
  if (d.file === undefined) return {};
  const file = isAbsolute(d.file) ? posix(relative(root, d.file)) : d.file;
  const source = d.span === undefined ? undefined : read(d.file);
  if (d.span === undefined || source === undefined) return { at: file };
  const map = new LineMap(source);
  const { line, character } = map.positionAt(d.span.start);
  // The line from its first character to the next one's: its break goes with the trim.
  const end = line + 1 < map.lineCount ? map.offsetAt({ line: line + 1, character: 0 }) : source.length;
  const quote = source.slice(map.offsetAt({ line, character: 0 }), end).trim();
  return { at: `${file}:${line + 1}:${character + 1}`, quote };
}

/** The why and the fix of every fudic code among `codes`, each once. A TypeScript code has none. */
export function codeTexts(codes: Iterable<string>): Readonly<Record<string, CodeText>> {
  const out: Record<string, CodeText> = {};
  for (const code of [...new Set(codes)].sort()) {
    const explained = explain(code);
    if (explained === undefined) continue;
    out[code] = { title: explained.title, why: explained.why, ...(explained.fix !== undefined ? { fix: explained.fix } : {}) };
  }
  return out;
}
