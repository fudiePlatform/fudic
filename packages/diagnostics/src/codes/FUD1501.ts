import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1501`. */
export interface FUD1501Params extends SourceInput {
  /** The line: `data`, `props`, `path`… */
  readonly line: string;
  /** The kind of this spec. */
  readonly kind: 'component' | 'page' | 'flow';
  /** The kinds of spec the line belongs to. */
  readonly belongs: readonly string[];
}

/** A fixture line in a kind of spec it does not belong to (`.fudspec`) (SDD-82). */
export const FUD1501 = (p: FUD1501Params): SourceDiagnostic =>
  source('FUD1501', 'error', `\`${p.line}\` is a line of a ${p.belongs.join(' or ')} spec, and this is a ${p.kind} spec`, p);
