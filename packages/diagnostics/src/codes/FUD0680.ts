import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0680`. */
export interface FUD0680Params extends SourceInput {
  /** The injected class. */
  readonly provider: string;
}

/** An injected service that nothing registers (SDD-38). */
export const FUD0680 = (p: FUD0680Params): SourceDiagnostic =>
  source(
    'FUD0680',
    'error',
    `Nothing registers \`${p.provider}\`: its module neither calls \`Service(${p.provider})\` nor \`provide(${p.provider}, …)\`, and no component provides it`,
    p,
  );
