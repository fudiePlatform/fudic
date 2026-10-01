import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A `<style>` inside a `@snippet` body (SDD-29). */
export const FUD0822 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0822',
    'error',
    'a @snippet has no <style>: it contributes no CSS and takes no part in the cascade of the head it expands into',
    p,
  );
