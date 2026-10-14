/**
 * What the workbench tells its shells and its parent process, and what they can ask of it. One
 * JSON text per message — a WebSocket frame, or a line on stdout/stdin — versioned so it can
 * change without breaking a shell that is already open.
 *
 * A process serves several components of one project, so every message about a component
 * carries its `tag`.
 */

import { render, type FudCode, type FudDiagnostic, type Severity } from '@fudic/diagnostics';
import type { BlockKind, Layer } from '@fudic/spec';
import type { BrowserName } from './browser.js';

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

/** The version every message carries. */
export const VERSION = 2;

export interface DescribedStep {
  readonly block: BlockKind;
  readonly text: string;
  /** The module of its term; null when it does not resolve. */
  readonly file: string | null;
}

export interface DescribedCriterion {
  readonly id: string;
  readonly route: string;
  /** 1-based: the line of its `criterion` in the `.fudspec`; 1 without one. */
  readonly line: number;
  readonly steps: readonly DescribedStep[];
}

export interface SessionMessage {
  readonly v: 2;
  readonly type: 'session';
  readonly tag: string;
  /** The `.fudspec`, absolute; null when the component has none. */
  readonly spec: string | null;
  /** The browser the criteria run in; set by the workbench when it publishes. */
  readonly browser?: BrowserName;
  readonly diagnostics: readonly WireDiagnostic[];
  readonly criteria: readonly DescribedCriterion[];
}

export interface RunningMessage {
  readonly v: 2;
  readonly type: 'running';
  readonly tag: string;
  readonly ids: readonly string[];
  /** The save that started it; `file` null when nobody saved (the first run, or a command). */
  readonly trigger: { readonly file: string | null; readonly at: number };
}

export interface ResultMessage {
  readonly v: 2;
  readonly type: 'result';
  readonly tag: string;
  readonly id: string;
  readonly verdict: Verdict;
  readonly ms: number;
  readonly steps: readonly StepResult[];
  readonly pageErrors: readonly string[];
  /** Why the criterion could not run at all: its page did not load, its fixture failed. */
  readonly error?: string;
}

/** What is not about one criterion: Vite does not start, the browser went away. To every shell. */
export interface ProblemMessage {
  readonly v: 2;
  readonly type: 'problem';
  readonly message: string;
}

export type BenchMessage = SessionMessage | RunningMessage | ResultMessage | ProblemMessage;

/** The commands a parent process sends on stdin, one JSON line each. */
export type Command =
  | { readonly v: 2; readonly type: 'open'; readonly file: string }
  | { readonly v: 2; readonly type: 'close'; readonly tag: string };

/** `open` answered: the component's shell. */
export interface OpenedMessage {
  readonly v: 2;
  readonly type: 'opened';
  readonly url: string;
  readonly tag: string;
  readonly component: string;
  readonly criteria: number;
}

/** `open` refused. */
export interface ErrorMessage {
  readonly v: 2;
  readonly type: 'error';
  readonly file: string;
  readonly error: { readonly code: string; readonly message: string };
}

/** A command as a value, or undefined when it is not one: whatever else arrives is ignored. */
export function parseCommand(line: string): Command | undefined {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (typeof value !== 'object' || value === null) return undefined;
  const command = value as { v?: unknown; type?: unknown; file?: unknown; tag?: unknown };
  if (command.v !== VERSION) return undefined;
  if (command.type === 'open' && typeof command.file === 'string') return { v: 2, type: 'open', file: command.file };
  if (command.type === 'close' && typeof command.tag === 'string') return { v: 2, type: 'close', tag: command.tag };
  return undefined;
}

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
