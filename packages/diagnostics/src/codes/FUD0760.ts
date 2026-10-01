import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD0760`; `file` is the `.fud` that wrote the link. */
export type FUD0760Params = FileInput &
  (
    | {
        /** The package is not installed: the fix is an install. */
        readonly reason: 'not-installed';
        /** The href as written. */
        readonly href: string;
      }
    | {
        /** The package is installed and does not export the file: the fix is its `package.json`. */
        readonly reason: 'not-exported';
        /** The href as written. */
        readonly href: string;
        /** The package part of the href. */
        readonly pkg: string;
      }
  );

/** A `<link rel="component">` whose package specifier does not resolve (SDD-43). */
export const FUD0760 = (p: FUD0760Params): FileDiagnostic =>
  file(
    'FUD0760',
    'error',
    p.reason === 'not-installed'
      ? `"${p.href}" names a package that is not installed. Add it to this project's ` +
          'dependencies and install — the file cannot be found until the package is there.'
      : `the package "${p.pkg}" is installed but does not publish ` +
          `"${p.href}". Its "exports" decides what a consumer may link; the fix is in that ` +
          "package's package.json, not in an install.",
    p,
  );
