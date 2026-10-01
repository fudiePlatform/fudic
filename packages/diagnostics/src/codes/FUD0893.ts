import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A layout hole (`@RenderBody()`/`@RenderSection()`) inside `@if`, `@switch` or a loop (SDD-48). */
export const FUD0893 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0893',
    'error',
    'a hole of the layout cannot live inside `@if`, `@switch` or a loop: the route would be written zero or many times. Keep the hole fixed and branch inside the route',
    p,
  );
