import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1524`. */
export interface FUD1524Params extends SourceInput {
  /** What the author wrote: `field-sizing`, `:state()`, `showPopover`. */
  readonly name: string;
  /** The compat key it was read as: `css.properties.field-sizing`. */
  readonly key: string;
  /** The project's level, in words: `widely available`, `newly available`, `Baseline 2024`. */
  readonly baseline: string;
  /** When it reached every core browser (`YYYY-MM-DD`); null when it has not yet. */
  readonly newly: string | null;
  /** When it becomes widely available (`YYYY-MM-DD`); absent when `newly` is null. */
  readonly widely?: string;
  /** The core browsers that have it, with the first version: `Chrome 123`. */
  readonly support: readonly string[];
  /** The core browsers that do not have it yet: `Safari`. Empty when `newly` is a date. */
  readonly missing: readonly string[];
}

/** Something of the browser newer than the project's Baseline (SDD-83). */
export const FUD1524 = (p: FUD1524Params): SourceDiagnostic => {
  const when =
    p.newly === null
      ? `not yet in every core browser (missing ${p.missing.join(', ')})`
      : `newly available on ${p.newly}${p.widely === undefined ? '' : `, widely available on ${p.widely}`}`;
  const support = p.support.length === 0 ? '' : `. ${p.support.join(', ')}`;
  return source(
    'FUD1524',
    'warning',
    `\`${p.name}\` (${p.key}) is newer than this project's Baseline (${p.baseline}): ${when}${support}`,
    p,
  );
};
