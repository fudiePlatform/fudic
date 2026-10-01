import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0721`. */
export interface FUD0721Params extends SourceInput {
  /** The tag the link declares. */
  readonly tag: string;
}

/** A `<link rel="component">` whose tag the file never uses (BUG-32). */
export const FUD0721 = (p: FUD0721Params): SourceDiagnostic =>
  source(
    'FUD0721',
    'warning',
    `\`<${p.tag}>\` is declared here and used nowhere in this file: the \`<link rel="component">\` can go`,
    p,
  );
