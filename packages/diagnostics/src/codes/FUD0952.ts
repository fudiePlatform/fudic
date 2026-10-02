import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** `props` outside `given`, or a second one in the criterion (SDD-52). */
export const FUD0952 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0952', 'error', 'props goes in given, at most once per criterion', p);
