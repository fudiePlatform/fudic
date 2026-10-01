import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A layout whose `@server` region exports `load` (SDD-21). */
export const FUD0430 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0430', 'error', 'a layout cannot export load: it receives the route data (v1)', p);
