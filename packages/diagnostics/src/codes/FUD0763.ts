import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD0763`; `file` is the `.fud` that wrote the link. */
export interface FUD0763Params extends FileInput {
  /** The href as written. */
  readonly href: string;
  /** The package it resolves into. */
  readonly pkg: string;
}

/** A link that resolves into a package that is not a fudic library (SDD-43). */
export const FUD0763 = (p: FUD0763Params): FileDiagnostic =>
  file(
    'FUD0763',
    'error',
    `"${p.href}" resolves inside "${p.pkg}", which does not declare ` +
      'itself a fudic library. A package is consumable when its fudic.json says ' +
      '{ "kind": "lib" }; without it, what you are linking is somebody\'s private file.',
    p,
  );
