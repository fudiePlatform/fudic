import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0702`. */
export interface FUD0702Params extends SourceInput {
  /** The required layout prop the route leaves unresolved. */
  readonly name: string;
  /** Its declared type, when the layout writes one. */
  readonly type?: string;
}

/** The route does not resolve a REQUIRED prop of its layout (SDD-40). */
export const FUD0702 = (p: FUD0702Params): SourceDiagnostic =>
  source(
    'FUD0702',
    'error',
    `the layout requires the prop \`${p.name}\`${p.type === undefined ? '' : `: ${p.type}`} and this route does not resolve it — return it from \`export function layout(ctx, data)\``,
    p,
  );
