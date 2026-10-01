import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD0802`; `file` is the output file that differs. */
export interface FUD0802Params extends FileInput {
  /** `piece`: the piece itself differs; `map`: its source map does. */
  readonly what: 'piece' | 'map';
  /** The piece's origin-absolute URL. */
  readonly url: string;
  /** The package that publishes it. */
  readonly pkg: string;
}

/** The output already holds a published piece (or its map) with different bytes (SDD-45). */
export const FUD0802 = (p: FUD0802Params): FileDiagnostic =>
  file(
    'FUD0802',
    'warning',
    p.what === 'piece'
      ? `the output already holds "${p.url}" with different bytes than "${p.pkg}" ` +
          'would copy there. Two applications sharing an origin write the same file with the ' +
          'same content, because the framework built it and not their builds: different ' +
          'content means one version of the package was published twice with two contents, ' +
          'and whichever deploys last decides what every page of the origin runs.'
      : `the output already holds the source map of "${p.url}" with different bytes ` +
          `than "${p.pkg}" would copy there. Same cause as a piece that differs: one ` +
          'version of the package was published twice with two contents.',
    p,
  );
