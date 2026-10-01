import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0682`. */
export interface FUD0682Params extends SourceInput {
  /** The injected provider. */
  readonly provider: string;
  /** The zone the injection is written in; the provider lives only in the other one. */
  readonly zone: 'client' | 'server';
}

/** A provider injected in one zone of `@code` and provided only in the opposite one (SDD-38). */
export const FUD0682 = (p: FUD0682Params): SourceDiagnostic =>
  source(
    'FUD0682',
    'error',
    `\`${p.provider}\` is injected in @${p.zone} but this @code only provides it in ${p.zone === 'client' ? '@server' : '@client'}: the two never run on the same side. Move the provider to the neutral zone to have it on both.`,
    p,
  );
