import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1561`. */
export interface FUD1561Params extends SourceInput {
  /** `beforeCreate` or `afterCreate`. */
  readonly hook: string;
  /** The file that is never created in the browser. */
  readonly role: 'route' | 'layout';
}

/** A create hook in a route or a layout, which always come from the server (SDD-86). */
export const FUD1561 = (p: FUD1561Params): SourceDiagnostic =>
  source(
    'FUD1561',
    'error',
    `${p.hook} never runs in a ${p.role}: a ${p.role} always comes painted from the server, so it hydrates and is never created; use ${p.hook === 'beforeCreate' ? 'beforeHydrate' : 'afterHydrate'}`,
    p,
  );
