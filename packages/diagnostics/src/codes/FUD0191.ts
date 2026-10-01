import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0191`. */
export interface FUD0191Params extends SourceInput {
  /** The custom element's tag. */
  readonly tag: string;
}

/** A custom element used without a `<link rel="component">` declaration (SDD-12). */
export const FUD0191 = (p: FUD0191Params): SourceDiagnostic =>
  source(
    'FUD0191',
    'error',
    `custom element \`<${p.tag}>\` used without a \`<link rel="component">\` declaration`,
    p,
  );
