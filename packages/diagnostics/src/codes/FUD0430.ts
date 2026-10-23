import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A layout whose `@code` exports `load` (SDD-21, SDD-60). */
export const FUD0430 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0430', 'error', "a layout has no `load`: it receives the route's data, from the `load` of the route's `.fudapi`", p);
