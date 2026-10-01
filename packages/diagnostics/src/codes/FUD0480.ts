import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A `<style>` body the formatter left as written because it does not parse as CSS (SDD-26). */
export const FUD0480 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0480', 'info', 'Left <style> unformatted: it does not parse as CSS', p);
