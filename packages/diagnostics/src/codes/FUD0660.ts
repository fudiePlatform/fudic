import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0660`. */
export interface FUD0660Params extends SourceInput {
  /** The delegated name read, without the leading `$`. */
  readonly name: string;
}

/** A handler reads `$name` and no descendant declares `delegate:name` (SDD-37). */
export const FUD0660 = (p: FUD0660Params): SourceDiagnostic =>
  source(
    'FUD0660',
    'error',
    `no descendant declares \`delegate:${p.name}\`: \`$${p.name}\` would have no row to read`,
    p,
  );
