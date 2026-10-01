import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0291`. */
export interface FUD0291Params extends SourceInput {
  /**
   * Who found it: the semantic pass (`analysis`), or the emit that could not subscribe the
   * binding (`emit`). Each keeps its own wording.
   */
  readonly by: 'analysis' | 'emit';
}

/** An event handler that is not a reference, a call, a lambda or a function (SDD-15). */
export const FUD0291 = (p: FUD0291Params): SourceDiagnostic =>
  source(
    'FUD0291',
    'error',
    p.by === 'emit'
      ? 'event binding value must be a reference, a lambda or a call: this expression cannot be subscribed'
      : 'an event handler must be a reference, a call, a lambda or a function',
    p,
  );
