import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** An `effect(...)` written outside `@code { @client }` (SDD-31). */
export const FUD0570 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0570',
    'error',
    'effect(...) belongs in @code { @client }: an effect runs after the first render, and the server has none.',
    p,
  );
