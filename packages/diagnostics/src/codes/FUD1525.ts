import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD1525`. */
export interface FUD1525Params extends FileInput {
  /** The oldest browsers fudic runs in, as a date: `2024-03-05`. */
  readonly floor: string;
  /** The features that set the floor: `declarative-shadow-dom`. */
  readonly features: readonly string[];
  /** The project's level, in words: `Baseline 2023`. */
  readonly baseline: string;
  /** The date that level asks for: `2023-12-31`. */
  readonly cutoff: string;
}

/** A Baseline older than what fudic itself needs (SDD-83). */
export const FUD1525 = (p: FUD1525Params): FileDiagnostic =>
  file(
    'FUD1525',
    'warning',
    `fudic needs browsers from ${p.floor} on (${p.features.join(', ')}); ${p.baseline} asks for ${p.cutoff}`,
    p,
  );
