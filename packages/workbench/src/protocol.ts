/**
 * What the workbench tells the shell, over its WebSocket. One way only, server → shell, one JSON
 * text frame per message, versioned from the first message so it can change without breaking a
 * shell that is already open.
 */

import { render, type FudCode, type FudDiagnostic, type Severity } from '@fudic/diagnostics';
import type { BlockKind, Layer } from '@fudic/spec';

/** A diagnostic as the shell paints it: line and column are computed here, never stored. */
export interface WireDiagnostic {
  readonly code: FudCode;
  readonly severity: Severity;
  readonly message: string;
  /** Null for a problem with no file (a project, a command line). */
  readonly file: string | null;
  /** 1-based; null without a span or without the file's text. */
  readonly line: number | null;
  readonly column: number | null;
}

interface StepBase {
  readonly block: BlockKind;
  readonly term: string;
  /** Which root the term came from: two evidences of one term may come from two modules. */
  readonly layer: Layer;
  readonly args: readonly string[];
}

export interface StepPassed extends StepBase {
  readonly pass: boolean;
  readonly evidence: unknown;
}

export interface StepFailed extends StepBase {
  readonly error: string;
}

export type StepResult = StepPassed | StepFailed;

export type Verdict = 'pass' | 'fail' | 'error';

export interface SessionMessage {
  readonly v: 1;
  readonly type: 'session';
  readonly tag: string;
  readonly diagnostics: readonly WireDiagnostic[];
  readonly criteria: readonly {
    readonly id: string;
    readonly route: string;
    readonly steps: readonly { readonly block: BlockKind; readonly text: string }[];
  }[];
}

export interface RunningMessage {
  readonly v: 1;
  readonly type: 'running';
  readonly ids: readonly string[];
}

export interface ResultMessage {
  readonly v: 1;
  readonly type: 'result';
  readonly id: string;
  readonly verdict: Verdict;
  readonly ms: number;
  readonly steps: readonly StepResult[];
  readonly pageErrors: readonly string[];
  /** Why the criterion could not run at all: its page did not load, its fixture failed. */
  readonly error?: string;
}

export interface ProblemMessage {
  readonly v: 1;
  readonly type: 'problem';
  readonly message: string;
}

export type BenchMessage = SessionMessage | RunningMessage | ResultMessage | ProblemMessage;

/**
 * A diagnostic for the wire. `file` stands in when the diagnostic names none (a `.fudspec`
 * parse error is about the `.fudspec`); `read` gives the text a span is located in.
 */
export function toWire(
  diagnostic: FudDiagnostic,
  file: string | null,
  read: (file: string) => string | undefined,
): WireDiagnostic {
  const at = diagnostic.file ?? file;
  const start = at === null ? undefined : render(diagnostic, read(at)).start;
  return {
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    file: at,
    line: start?.line ?? null,
    column: start?.column ?? null,
  };
}
