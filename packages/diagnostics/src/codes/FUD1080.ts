import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1080`. */
export type FUD1080Params = SourceInput & {
  readonly name: string;
  /** What was looked for: `type`, `rule`, `middleware`, `pattern`, `form`. */
  readonly what: string;
  /** The names it may have meant; empty when none is close. */
  readonly candidates: readonly string[];
};

function suggest(candidates: readonly string[]): string {
  return candidates.length === 0 ? '' : `: did you mean ${candidates.map((c) => `\`${c}\``).join(', ')}?`;
}

/** A `.fudapi` name that nothing in the project declares (SDD-60). */
export const FUD1080 = (p: FUD1080Params): SourceDiagnostic =>
  source('FUD1080', 'error', `unknown ${p.what} \`${p.name}\`${suggest(p.candidates)}`, p);
