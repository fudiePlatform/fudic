import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0667`. */
export interface FUD0667Params extends SourceInput {
  /** The marker's name after `delegate:`; empty when it has none. */
  readonly name: string;
}

/** A `delegate:` marker written with a value (SDD-37). */
export const FUD0667 = (p: FUD0667Params): SourceDiagnostic =>
  source(
    'FUD0667',
    'error',
    '`delegate:` marker takes no value: the ancestor handler reads it as `$' +
      (p.name.length > 0 ? p.name : 'name') +
      '`',
    p,
  );
