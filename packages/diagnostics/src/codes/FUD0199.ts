import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/**
 * Parameters of `FUD0199`. `via` says what named the slot: a `slot="…"` attribute or the
 * `slot:` of a layout hole; `name` is the slot it names.
 */
export type FUD0199Params = SourceInput &
  (
    | {
        /** The element has no component parent to be projected into. */
        readonly reason: 'no-parent';
        readonly via: 'attribute' | 'hole';
        readonly name: string;
      }
    | {
        /** The parent is not a component. */
        readonly reason: 'not-a-component';
        readonly via: 'attribute' | 'hole';
        readonly name: string;
        readonly host: string;
      }
    | {
        /** The parent component declares no slot of that name. */
        readonly reason: 'undeclared';
        readonly name: string;
        readonly host: string;
      }
  );

/** The `slot="…"` written: `` `slot="x"` `` or `` `slot: "x"` ``. */
function label(via: 'attribute' | 'hole', name: string): string {
  return via === 'hole' ? `\`slot: "${name}"\`` : `\`slot="${name}"\``;
}

function message(p: FUD0199Params): string {
  switch (p.reason) {
    case 'no-parent':
      return `${label(p.via, p.name)} fills nothing: it has no component parent`;
    case 'not-a-component':
      return `${label(p.via, p.name)} fills nothing: \`${p.host}\` is not a component`;
    case 'undeclared':
      return `\`${p.host}\` declares no slot \`${p.name}\``;
  }
}

/** A `slot=` that fills no slot its parent declares (BUG-23). */
export const FUD0199 = (p: FUD0199Params): SourceDiagnostic =>
  source('FUD0199', 'error', message(p), p);
