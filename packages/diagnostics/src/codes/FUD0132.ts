import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Razor written inside a `<style>`, whose body is plain CSS (SDD-49). */
export const FUD0132 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0132',
    'error',
    'Razor is not allowed inside <style>: its body is plain CSS. Write what changes in the markup (style=, style:, class:)',
    p,
  );
