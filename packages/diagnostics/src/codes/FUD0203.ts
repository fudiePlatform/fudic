import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0203`. */
export interface FUD0203Params extends SourceInput {
  /** The computed passed. */
  readonly name: string;
  /** The child component's tag. */
  readonly tag: string;
  /** The prop, without the leading `.`. */
  readonly prop: string;
}

/** A `computed` passed to a prop the child writes (BUG-24). */
export const FUD0203 = (p: FUD0203Params): SourceDiagnostic =>
  source(
    'FUD0203',
    'error',
    `\`${p.name}\` is a computed and \`${p.tag}\` writes \`.${p.prop}\`: a derived value is not writable`,
    p,
  );
