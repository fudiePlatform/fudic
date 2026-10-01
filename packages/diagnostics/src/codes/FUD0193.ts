import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A `@server`/`@client` region nested inside another (SDD-12). */
export const FUD0193 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0193', 'error', '`@server`/`@client` regions cannot be nested', p);
