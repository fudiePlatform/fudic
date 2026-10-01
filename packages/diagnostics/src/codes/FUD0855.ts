import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** `@import` in a component's `<style>` (SDD-49). */
export const FUD0855 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0855',
    'error',
    'a component <style> takes no @import: its sheet is adopted, and an adopted sheet ignores it. Choose the sheet in fudic.json "styles" instead',
    p,
  );
