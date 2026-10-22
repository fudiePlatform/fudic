import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1112`. */
export type FUD1112Params = SourceInput & {
  readonly kind: 'layout' | 'snippet';
};

/** A `<link rel="server">` in a layout or a snippet file (SDD-60). */
export const FUD1112 = (p: FUD1112Params): SourceDiagnostic =>
  source('FUD1112', 'error', `a ${p.kind} has no server: \`<link rel="server">\` goes in a route or a component`, p);
