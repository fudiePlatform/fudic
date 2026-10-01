import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD0500`; `file` is the chunk. */
export interface FUD0500Params extends FileInput {
  /** The length of the hash build-id naming expects. */
  readonly length: number;
}

/** A chunk whose name does not end in a build hash, so build-id naming is off (SDD-27). */
export const FUD0500 = (p: FUD0500Params): FileDiagnostic =>
  file(
    'FUD0500',
    'warning',
    `chunk "${p.file}" does not end in a ${String(p.length)}-character hash; build-id naming needs the default build.rollupOptions.output`,
    p,
  );
