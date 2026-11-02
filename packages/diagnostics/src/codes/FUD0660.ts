import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0660`. */
export interface FUD0660Params extends SourceInput {
  /** The delegated name read. */
  readonly name: string;
  /** The event of the handler that reads it. */
  readonly event: string;
}

/** A handler reads a delegated row and no marker below serves its event (SDD-37, SDD-72). */
export const FUD0660 = (p: FUD0660Params): SourceDiagnostic =>
  source(
    'FUD0660',
    'error',
    `no \`delegate:${p.name}\` below serves \`@${p.event}\`: \`${p.name}\` would have no row to read`,
    p,
  );
