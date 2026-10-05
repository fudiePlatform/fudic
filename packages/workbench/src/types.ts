/**
 * The public shapes of the workbench: what `openWorkbench` takes and what it answers. Nothing
 * here knows VS Code: the editor talks to the workbench through the binary's JSON line.
 */

import type { FudDiagnostic } from '@fudic/diagnostics';

export interface WorkbenchOptions {
  /** Port of the server. 0 by default: ephemeral. */
  readonly port?: number;
  /** Keep the folder of generated pages on close. */
  readonly keep?: boolean;
}

export interface WorkbenchSession {
  /** The shell: what the VS Code tab and the browser button open. */
  readonly url: string;
  readonly tag: string;
  /** Absolute path of the component's `.fud`. */
  readonly component: string;
  /** Number of criteria of the first session load. */
  readonly criteria: number;
  /** Closes browser, Vite and server, and deletes the folder unless `keep`. Idempotent. */
  close(): Promise<void>;
}

/** Why the workbench could not open. */
export interface WorkbenchFailure {
  readonly diagnostic: FudDiagnostic;
}

/** Narrows an answer that may be a failure. */
export function isFailure<T extends object>(value: T | WorkbenchFailure): value is WorkbenchFailure {
  return 'diagnostic' in value;
}
