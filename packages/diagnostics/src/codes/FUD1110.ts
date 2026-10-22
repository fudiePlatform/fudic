import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1110`. */
export type FUD1110Params = SourceInput & {
  /** `server` or `client`: the region written. */
  readonly region: 'server' | 'client';
};

/** A `@server` or `@client` region in a `@code`: the `@code` is browser code only (SDD-60). */
export const FUD1110 = (p: FUD1110Params): SourceDiagnostic =>
  source(
    'FUD1110',
    'error',
    p.region === 'server'
      ? '`@server` no longer exists: declare `load`, functions and forms in a sibling `.fudapi`, link it with `<link rel="server">`, and write the handlers in `src/server`'
      : '`@client` no longer exists: the whole `@code` is browser code — write its content without the wrapper',
    p,
  );
