import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** What is wrong with `sw.json`. */
export type FUD0390Problem =
  /** The text does not parse as JSON. */
  | { readonly problem: 'not-json'; readonly reason: string }
  /** Not an object with a `shell` array. */
  | { readonly problem: 'no-shell' }
  /** A resource rule without a pattern or with an unknown policy. */
  | { readonly problem: 'resource'; readonly name: string };

/** Parameters of `FUD0390`; `file` is the `sw.json`. */
export type FUD0390Params = FileInput & FUD0390Problem;

function describe(p: FUD0390Params): string {
  switch (p.problem) {
    case 'not-json':
      return `${p.file} is not valid JSON: ${p.reason}`;
    case 'no-shell':
      return `${p.file} must be an object with a "shell" array`;
    case 'resource':
      return `${p.file}: resource "${p.name}" needs a pattern and a valid policy`;
  }
}

/** `sw.json` is malformed (SDD-20). */
export const FUD0390 = (p: FUD0390Params): FileDiagnostic => file('FUD0390', 'error', describe(p), p);
