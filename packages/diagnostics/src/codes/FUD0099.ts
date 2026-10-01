import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0099`. */
export interface FUD0099Params extends SourceInput {
  /** Which prefix names nothing: `@` (event), `.` (property) or `delegate:`. */
  readonly binding: 'event' | 'property' | 'delegate';
}

const MESSAGES: Readonly<Record<FUD0099Params['binding'], string>> = {
  event: 'event binding has no event name after `@`',
  property: 'property binding has no property name after `.`',
  delegate: 'delegation marker has no name after `delegate:`',
};

/** A binding prefix (`@`, `.`, `delegate:`) with no name after it (SDD-07). */
export const FUD0099 = (p: FUD0099Params): SourceDiagnostic =>
  source('FUD0099', 'error', MESSAGES[p.binding], p);
