import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A criteria file without its `component` declaration (`.fudspec`). */
export const FUD0922 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0922', 'error', 'a `.fudspec` declares its component first: `component <tag>`', p);
