import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1003`. */
export type FUD1003Params = SourceInput & {
  /** The reserved name used: `paths`, `layout` or `http`. */
  readonly name: string;
};

/** A server function named `paths`, `layout` or `http` (SDD-56). */
export const FUD1003 = (p: FUD1003Params): SourceDiagnostic =>
  source(
    'FUD1003',
    'error',
    `\`${p.name}\` is a reserved export of the \`@server\` and cannot name a server function`,
    p,
  );
