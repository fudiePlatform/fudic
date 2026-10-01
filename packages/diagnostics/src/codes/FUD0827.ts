import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0827`. */
export interface FUD0827Params extends SourceInput {
  /** The namespace the call uses. */
  readonly namespace: string;
}

/** A `@render ns.name` whose namespace no `<link rel="snippet" as>` declares (SDD-29). */
export const FUD0827 = (p: FUD0827Params): SourceDiagnostic =>
  source(
    'FUD0827',
    'error',
    `no <link rel="snippet" as="${p.namespace}"> in this file: "as" is the only thing that declares a namespace, and it is never inferred`,
    p,
  );
