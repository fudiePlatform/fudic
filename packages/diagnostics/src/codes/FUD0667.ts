import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0667`. */
export interface FUD0667Params extends SourceInput {
  /** The marker's name after `delegate:`; empty when it has none. */
  readonly name: string;
}

/** A `delegate:` marker whose value is not a non-empty literal list of events (SDD-37, SDD-72). */
export const FUD0667 = (p: FUD0667Params): SourceDiagnostic =>
  source(
    'FUD0667',
    'error',
    `a \`delegate:\` marker takes no value, or the names of the events it serves: \`delegate:${p.name.length > 0 ? p.name : 'name'}="click"\``,
    p,
  );
