import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0681`. */
export interface FUD0681Params extends SourceInput {
  /** The name injected in `@server` and read by the binding. */
  readonly name: string;
}

/** A name injected in `@server` and read by a binding of a component that hydrates (SDD-38). */
export const FUD0681 = (p: FUD0681Params): SourceDiagnostic =>
  source(
    'FUD0681',
    'error',
    `\`${p.name}\` is injected in @server and read by a binding of a component that hydrates: @server never reaches the browser chunk, so the first update throws on a name that is not there.`,
    p,
  );
