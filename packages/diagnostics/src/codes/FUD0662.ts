import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0662`. */
export interface FUD0662Params extends SourceInput {
  /** The name the marker delegates. */
  readonly name: string;
  /** The bindings the enclosing loop headers declare, deduplicated, in order. */
  readonly available: readonly string[];
}

/** A `delegate:name` whose name is not a binding of an enclosing loop header (SDD-37). */
export const FUD0662 = (p: FUD0662Params): SourceDiagnostic => {
  const listed = p.available.map((name) => `\`${name}\``).join(', ');
  const offer =
    listed.length > 0 ? `this loop declares ${listed}` : 'this loop declares no binding to delegate';
  return source('FUD0662', 'error', `\`${p.name}\` is not a binding of the loop header: ${offer}`, p);
};
