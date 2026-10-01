import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0156`. */
export interface FUD0156Params extends SourceInput {
  /** No root element, more than one, or one whose tag has no hyphen. */
  readonly problem: 'missing' | 'several' | 'no-hyphen';
}

const MESSAGES: Readonly<Record<FUD0156Params['problem'], string>> = {
  missing: 'A component must have exactly one custom-element host wrapper',
  several: 'A component must have exactly one root host wrapper',
  'no-hyphen': 'The host wrapper tag must be a custom element (contain a hyphen)',
};

/** A component whose host wrapper is absent, repeated or not a custom element (SDD-10). */
export const FUD0156 = (p: FUD0156Params): SourceDiagnostic =>
  source('FUD0156', 'error', MESSAGES[p.problem], p);
