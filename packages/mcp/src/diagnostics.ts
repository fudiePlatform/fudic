/**
 * A diagnostic as a model reads it: `file:line:column` and the line it starts on, never offsets,
 * and the why and the fix of each fudic code once per answer instead of once per diagnostic.
 */

import { relative } from 'node:path';
import { LineMap, type FudDiagnostic, type Severity } from '@fudic/diagnostics';
import { explain } from '@fudic/diagnostics/explain';

export interface OutDiagnostic {
  readonly code: string;
  readonly severity: Severity;
  readonly message: string;
  /** `src/components/app-card/app-card.fud:15:3`, relative to the project and 1-based. */
  readonly at?: string;
  /** The line the problem starts on, without its indentation. */
  readonly quote?: string;
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
export function outDiagnostic(d: FudDiagnostic, root: string, read: ReadSource): OutDiagnostic {
  const base = { code: d.code, severity: d.severity, message: d.message };
  if (d.file === undefined) return base;
  const file = posix(relative(root, d.file));
  const source = d.span === undefined ? undefined : read(d.file);
  if (d.span === undefined || source === undefined) return { ...base, at: file };
  const { line, character } = new LineMap(source).positionAt(d.span.start);
  const quote = (source.split(/\r\n|\r|\n/u)[line] ?? '').trim();
  return { ...base, at: `${file}:${line + 1}:${character + 1}`, quote };
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
