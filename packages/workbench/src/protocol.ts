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
  /** Whatever the term returned; null when the step was ignored. */
  readonly evidence: unknown;
  /** The term asked for something the workbench does not do (`goto`): it did not apply. */
  readonly ignored?: true;
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

/** A rectangle in pixels. */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Where a step's reference was, in the `after` shot. */
export interface Mark {
  /** Index of the step in the criterion. */
  readonly step: number;
  readonly ref: string;
  readonly box: Box;
}

export interface ResultMessage {
  readonly v: 2;
  readonly type: 'result';
  readonly tag: string;
  readonly id: string;
  readonly verdict: Verdict;
  readonly ms: number;
  /** The criterion's previous verdict in this process, when it ran before. */
  readonly was?: Verdict;
  readonly steps: readonly StepResult[];
  /** URLs of what the measuring browser saw: before the first `when`, and at the end. */
  readonly shots: { readonly before?: string; readonly after?: string };
  readonly marks: readonly Mark[];
  readonly pageErrors: readonly string[];
  /** Why the criterion could not run at all: its page did not load, its fixture failed. */
  readonly error?: string;
}

/** What the runs of a component are doing: pinned, paused, and how many saves wait. */
export interface StateMessage {
  readonly v: 2;
  readonly type: 'state';
  readonly tag: string;
  readonly paused: boolean;
  readonly pinned: string | null;
  readonly pending: number;
}

/** Criteria a `cancel` stopped: their cards go back to their last result. */
export interface CancelledMessage {
  readonly v: 2;
  readonly type: 'cancelled';
  readonly tag: string;
  readonly ids: readonly string[];
}

/** What is not about one criterion: Vite does not start, the browser went away. To every shell. */
export interface ProblemMessage {
  readonly v: 2;
  readonly type: 'problem';
  readonly message: string;
}

export type BenchMessage =
  | SessionMessage
  | RunningMessage
  | ResultMessage
  | StateMessage
  | CancelledMessage
  | ProblemMessage;

/** What a shell may ask of its component: what the buttons do. */
export type RunCommand =
  | { readonly v: 2; readonly type: 'run'; readonly tag: string; readonly ids?: readonly string[]; readonly failing?: true }
  | { readonly v: 2; readonly type: 'pin'; readonly tag: string; readonly id: string | null }
  | { readonly v: 2; readonly type: 'pause'; readonly tag: string; readonly paused: boolean }
  | { readonly v: 2; readonly type: 'cancel'; readonly tag: string };

/** Every command: the parent process on stdin may also open and close components. */
export type Command =
  | { readonly v: 2; readonly type: 'open'; readonly file: string }
  | { readonly v: 2; readonly type: 'close'; readonly tag: string }
  | RunCommand;

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
  const command = value as Record<string, unknown>;
  if (command['v'] !== VERSION) return undefined;
  const { type, file, tag } = command;
  if (type === 'open') return typeof file === 'string' ? { v: 2, type, file } : undefined;
  if (typeof tag !== 'string') return undefined;
  switch (type) {
    case 'close':
    case 'cancel':
      return { v: 2, type, tag };
    case 'run':
      return runCommand(tag, command['ids'], command['failing']);
    case 'pin': {
      const id = command['id'];
      return id === null || typeof id === 'string' ? { v: 2, type, tag, id } : undefined;
    }
    case 'pause': {
      const paused = command['paused'];
      return typeof paused === 'boolean' ? { v: 2, type, tag, paused } : undefined;
    }
    default:
      return undefined;
  }
}

function runCommand(tag: string, ids: unknown, failing: unknown): RunCommand | undefined {
  if (ids !== undefined && !(Array.isArray(ids) && ids.every((id) => typeof id === 'string'))) return undefined;
  if (failing !== undefined && failing !== true) return undefined;
  return {
    v: 2,
    type: 'run',
    tag,
    ...(ids !== undefined ? { ids: ids as string[] } : {}),
    ...(failing === true ? { failing: true as const } : {}),
  };
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
