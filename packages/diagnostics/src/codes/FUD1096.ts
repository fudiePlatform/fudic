import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1096`. */
export type FUD1096Params = SourceInput;

/** A second `messages` in the project (SDD-60). */
export const FUD1096 = (p: FUD1096Params): SourceDiagnostic =>
  source('FUD1096', 'error', 'a project has at most one `messages`', p);
