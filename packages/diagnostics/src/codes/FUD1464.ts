import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1464`. */
export interface FUD1464Params extends SourceInput {
  /** The event of the handler, as written: `change`, `click.borrar`. */
  readonly event: string;
  /** The delegated row the marks belong to. */
  readonly name: string;
  /** The value types the marks give, one per kind. */
  readonly types: readonly string[];
}

/** `$value` in a delegated handler whose marks give values of different types (SDD-80). */
export const FUD1464 = (p: FUD1464Params): SourceDiagnostic =>
  source(
    'FUD1464',
    'error',
    `the marks \`delegate:${p.name}\` that serve \`${p.event}\` give values of different types (${p.types.join(', ')}): list the events each marker serves`,
    p,
  );
