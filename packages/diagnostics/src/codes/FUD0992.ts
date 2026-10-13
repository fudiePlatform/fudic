import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A props spread on an element that is not a component of this project. */
export const FUD0992 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0992', 'error', 'a props spread only goes on a component: there are no props to spread into', p);
