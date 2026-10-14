/**
 * The public shapes of the workbench: what `openWorkbench` takes and what it answers. Nothing
 * here knows VS Code: the editor talks to the workbench through the binary's JSON lines.
 */

import type { FudDiagnostic } from '@fudic/diagnostics';
import type { BenchMessage } from './protocol.js';

export interface WorkbenchOptions {
  /** Port of the server. 0 by default: ephemeral. */
  readonly port?: number;
  /** Keep the folder of generated pages on close. */
  readonly keep?: boolean;
  /** Every message the shells receive, from the first one: what the binary writes on stdout. */
  readonly onMessage?: (message: BenchMessage) => void;
}

/** One component open in a workbench. */
export interface OpenedComponent {
  /** Its shell: what the VS Code tab and the browser button open. */
  readonly url: string;
  readonly tag: string;
  /** Absolute path of the component's `.fud`. */
  readonly component: string;
  /** Number of criteria of its first session load. */
  readonly criteria: number;
}

/** A workbench: one project, the component it was opened with first, and any opened later. */
export interface WorkbenchSession extends OpenedComponent {
  /** Opens another component of the same project; one already open answers as it is. */
  open(file: string): Promise<OpenedComponent | WorkbenchFailure>;
  /** Closes one component: its runs stop and its pages go. Unknown tags are ignored. */
  closeComponent(tag: string): void;
  /** Closes browser, Vite and server, and deletes the folder unless `keep`. Idempotent. */
  close(): Promise<void>;
}

/** Why the workbench, or a component, could not open. */
export interface WorkbenchFailure {
  readonly diagnostic: FudDiagnostic;
}

/** Narrows an answer that may be a failure. */
export function isFailure<T extends object>(value: T | WorkbenchFailure): value is WorkbenchFailure {
  return 'diagnostic' in value;
}
