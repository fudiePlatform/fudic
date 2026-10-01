import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0014`. */
export interface FUD0014Params extends SourceInput {
  /** The raw-text element left open, e.g. `script`. */
  readonly element: string;
}

/** A raw-text element (`<script>`, `<style>`, …) with no close tag (SDD-03). */
export const FUD0014 = (p: FUD0014Params): SourceDiagnostic =>
  source('FUD0014', 'error', `unterminated <${p.element}> element`, p);
