import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A text node that holds a JSX loop or condition, `{xs.map(…)}` or `{c && <p>…}` (SDD-62). */
export const FUD1162 = (p: SourceInput): SourceDiagnostic =>
  source('FUD1162', 'warning', 'this is JSX, and the page prints it as text: write it with `@foreach` or `@if`', p);
