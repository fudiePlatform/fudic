import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1380`. */
export interface FUD1380Params extends SourceInput {
  /** The event, without the `@`. */
  readonly event: string;
  /** The single binding of the nearest loop header; absent when it declares several or none. */
  readonly name?: string;
  /** The bubbling event to delegate instead, for one that does not bubble. */
  readonly substitute?: string;
}

/** An event binding inside a loop body: one listener per item (SDD-72). */
export const FUD1380 = (p: FUD1380Params): SourceDiagnostic => {
  const name = p.name ?? 'name';
  const instead = p.substitute === undefined ? '' : ` (use \`@${p.substitute}\`)`;
  return source(
    'FUD1380',
    'warning',
    `an \`@${p.event}\` inside a loop adds one listener per item. Delegate it${instead}: put the handler on an element outside the loop, pass it \`${name}\`, and mark this element with \`delegate:${name}\``,
    p,
  );
};
