import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A `host` attribute written on a component's `<style>` (SDD-10). */
export const FUD0160 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0160',
    'error',
    'The host attribute is a reserved output marker and cannot be written in source',
    p,
  );
