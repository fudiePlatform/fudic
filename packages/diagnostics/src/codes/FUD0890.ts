import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0890`. */
export interface FUD0890Params extends SourceInput {
  /** The required sections the route does not declare, in layout order (at least one). */
  readonly names: readonly string[];
}

/** A route that does not fill a `required: true` section of its layout (SDD-48). */
export const FUD0890 = (p: FUD0890Params): SourceDiagnostic => {
  const plural = p.names.length > 1;
  const names = p.names.map((n) => `\`${n}\``).join(', ');
  return source(
    'FUD0890',
    'error',
    `the layout requires the section${plural ? 's' : ''} ${names}: declare ${plural ? 'them' : 'it'} with \`@section name { … }\``,
    p,
  );
};
