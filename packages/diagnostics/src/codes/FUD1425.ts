import { file, project } from '../make.js';
import type { Span } from '../span.js';
import type { FileDiagnostic, ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD1425`. */
export interface FUD1425Params {
  /** What was thrown. */
  readonly reason: string;
  /** Where it was thrown, when the source has a place. */
  readonly file?: string;
  readonly span?: Span;
}

/** An exception in the SSR or a handler while the preview runs (SDD-78). */
export const FUD1425 = (p: FUD1425Params): FileDiagnostic | ProjectDiagnostic => {
  const message = `the server failed while previewing: ${p.reason}`;
  return p.file === undefined
    ? project('FUD1425', 'error', message)
    : file('FUD1425', 'error', message, { file: p.file, ...(p.span !== undefined ? { span: p.span } : {}) });
};
