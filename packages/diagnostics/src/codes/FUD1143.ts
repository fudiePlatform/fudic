import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** An object or array literal, a `bigint` or a lone surrogate in the view (SDD-61). */
export const FUD1143 = (p: SourceInput): SourceDiagnostic =>
  source('FUD1143', 'error', 'this literal does not port: the view holds no object, array or `bigint` literals', p);
