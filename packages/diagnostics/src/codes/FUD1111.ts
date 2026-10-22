import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1111`. */
export type FUD1111Params = SourceInput & {
  /** The `href` as written; `''` when there is none. */
  readonly href: string;
  /** Why it is refused: no `href`, not a `.fudapi`, or a file that does not exist. */
  readonly problem: 'missing' | 'extension' | 'not-found';
};

/** A `<link rel="server">` whose `href` is not an existing `.fudapi` (SDD-60). */
export const FUD1111 = (p: FUD1111Params): SourceDiagnostic =>
  source(
    'FUD1111',
    'error',
    p.problem === 'missing'
      ? '`<link rel="server">` needs an `href` to the `.fudapi` it links'
      : p.problem === 'extension'
        ? `\`<link rel="server">\` links a \`.fudapi\`, not "${p.href}"`
        : `"${p.href}" does not exist`,
    p,
  );
