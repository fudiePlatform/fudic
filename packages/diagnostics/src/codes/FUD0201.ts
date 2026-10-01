import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0201`. */
export interface FUD0201Params extends SourceInput {
  /** The prop, without the leading `.`. */
  readonly prop: string;
}

/** A function prop fed something that is not the bare name of a function (BUG-24). */
export const FUD0201 = (p: FUD0201Params): SourceDiagnostic =>
  source(
    'FUD0201',
    'error',
    `\`.${p.prop}\` takes a function by reference: name one of @code { @client }`,
    p,
  );
