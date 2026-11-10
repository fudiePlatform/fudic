import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1510`. */
export interface FUD1510Params extends SourceInput {
  /** The part of the fixture: `data`, `calls`, `services`, `paths`. */
  readonly group: string;
  /** What it has to be written as: `an object literal`, `an array of strings`, `a plain key`. */
  readonly expected: string;
}

/** A part of a fixture the editor cannot read without running it (`.fixture.ts`) (SDD-82). */
export const FUD1510 = (p: FUD1510Params): SourceDiagnostic =>
  source('FUD1510', 'error', `the fixture's \`${p.group}\` cannot be read without running it: write it as ${p.expected}`, p);
