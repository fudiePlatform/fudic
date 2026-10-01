import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0433`: what is wrong with the argument list of a layout directive. */
export type FUD0433Params = SourceInput &
  (
    | {
        /** `@RenderSection( … )` whose first argument is not a bare identifier. */
        readonly problem: 'section-name';
      }
    | {
        /** `@section` with no name after it. */
        readonly problem: 'missing-name';
      }
    | {
        /** A key that is unknown, repeated, or not followed by `,` / the end. */
        readonly problem: 'arguments';
        /** The directive as written, with its `@`. */
        readonly directive: string;
        /** The named arguments it takes, in order; empty when it takes none. */
        readonly allowed: readonly string[];
      }
    | {
        /** A known key not followed by `:`. */
        readonly problem: 'colon';
        readonly directive: string;
        /** The key written. */
        readonly key: string;
      }
    | {
        /** `slot:` with something other than a string literal. */
        readonly problem: 'slot';
        readonly directive: string;
      }
    | {
        /** `required:` with something other than `true` or `false`. */
        readonly problem: 'required';
        readonly directive: string;
      }
  );

function message(p: FUD0433Params): string {
  switch (p.problem) {
    case 'section-name':
      return '@RenderSection(name) expects a bare identifier';
    case 'missing-name':
      return '@section expects a name';
    case 'arguments':
      return p.allowed.length === 0
        ? `${p.directive}() takes no arguments`
        : `${p.directive} takes the named arguments ${p.allowed.map((k) => `\`${k}:\``).join(' and ')}, each at most once`;
    case 'colon':
      return `${p.directive}: expected ':' after \`${p.key}\``;
    case 'slot':
      return `${p.directive}: \`slot\` takes a string literal`;
    case 'required':
      return `${p.directive}: \`required\` takes \`true\` or \`false\``;
  }
}

/** An invalid argument of a layout directive (SDD-21, SDD-48). */
export const FUD0433 = (p: FUD0433Params): SourceDiagnostic => source('FUD0433', 'error', message(p), p);
