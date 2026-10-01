import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/**
 * Parameters of `FUD0131`: blocks left open at the end of the body (`unclosed`, with how
 * many), or a `}` with no open block (`unmatched`).
 */
export type FUD0131Params = SourceInput &
  ({ readonly kind: 'unclosed'; readonly blocks: number } | { readonly kind: 'unmatched' });

/** Unbalanced braces in the body of a `<style>` (SDD-09). */
export const FUD0131 = (p: FUD0131Params): SourceDiagnostic =>
  source(
    'FUD0131',
    'error',
    p.kind === 'unclosed'
      ? `Unbalanced CSS braces in <style>: ${p.blocks} block(s) left unclosed`
      : 'Unbalanced CSS braces in <style>: unmatched }',
    p,
  );
