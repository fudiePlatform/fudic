import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0836`: why the `<link rel="snippet">` imports nothing. */
export type FUD0836Params = SourceInput &
  (
    | {
        /** The link has no `href`. */
        readonly problem: 'no-href';
      }
    | {
        /** The `href` names no readable file. */
        readonly problem: 'unresolved';
        /** The `href` as written. */
        readonly href: string;
      }
    | {
        /** The file declares no `@snippet`. */
        readonly problem: 'empty';
        /** Absolute path of that file. */
        readonly path: string;
      }
  );

function message(p: FUD0836Params): string {
  switch (p.problem) {
    case 'no-href':
      return '<link rel="snippet"> requires a static href';
    case 'unresolved':
      return `<link rel="snippet"> does not resolve: no file for "${p.href}"`;
    case 'empty':
      return `${p.path} declares no @snippet: nothing is imported from it`;
  }
}

/** A `<link rel="snippet">` that names nothing readable, or a file with no snippet (SDD-29). */
export const FUD0836 = (p: FUD0836Params): SourceDiagnostic => source('FUD0836', 'error', message(p), p);
