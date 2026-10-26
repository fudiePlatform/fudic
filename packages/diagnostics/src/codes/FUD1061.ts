import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** What is wrong with the indentation of a line. */
export type FUD1061Problem = 'odd' | 'tab' | 'jump';

/** Parameters of `FUD1061`. */
export type FUD1061Params = SourceInput & {
  readonly problem: FUD1061Problem;
};

const WHY: Readonly<Record<FUD1061Problem, string>> = {
  odd: 'is not a multiple of 2 spaces',
  tab: 'uses a tab, and a tab is never indentation',
  jump: 'goes more than one level deeper than the line above',
};

/** A `.fudapi` line whose indentation cannot be read as a level (SDD-60). */
export const FUD1061 = (p: FUD1061Params): SourceDiagnostic =>
  source('FUD1061', 'error', `bad indentation: this line ${WHY[p.problem]}`, p);
