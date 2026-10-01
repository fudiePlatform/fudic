import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0158`. */
export interface FUD0158Params extends SourceInput {
  /** The attribute is absent, or present with a value other than `open`. */
  readonly problem: 'missing' | 'not-open';
}

/** A component `<template>` without `shadowrootmode="open"` (SDD-10). */
export const FUD0158 = (p: FUD0158Params): SourceDiagnostic =>
  source(
    'FUD0158',
    'error',
    p.problem === 'missing'
      ? 'The <template> requires shadowrootmode="open"'
      : 'shadowrootmode must be "open" (closed is out of v1)',
    p,
  );
