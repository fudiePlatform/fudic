import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** What is wrong with the command line, one variant per message. */
export type FUD0448Params =
  /** A flag that takes a value was given none. */
  | { readonly problem: 'flag-needs-value'; readonly name: string }
  /** A flag the command does not accept. */
  | { readonly problem: 'unknown-flag'; readonly name: string }
  /** A command the CLI does not have (`command` is `''` when there was none). */
  | { readonly problem: 'unknown-command'; readonly command: string }
  /** `--quote` with a value that is not a quote style. */
  | { readonly problem: 'quote-style'; readonly value: string }
  /** `--end-of-line` with a value that is not a line terminator. */
  | { readonly problem: 'line-terminator'; readonly value: string }
  /** `--print-width` that is not a number. */
  | { readonly problem: 'print-width' }
  /** `--tab-width` that is not a number. */
  | { readonly problem: 'tab-width' }
  /** `fudic new` with no project name. */
  | { readonly problem: 'new-needs-name' }
  /** `--pm` with an unknown package manager. */
  | { readonly problem: 'package-manager'; readonly value: string }
  /** `fudic g` with no type. */
  | { readonly problem: 'generate-needs-type' }
  /** `fudic g <type>` with no name. */
  | { readonly problem: 'generate-needs-name'; readonly type: string }
  /** `fudic g` with a type it does not generate. */
  | { readonly problem: 'unknown-type'; readonly type: string }
  /** A route with a segment that cannot be a file name. */
  | { readonly problem: 'route-segment'; readonly part: string; readonly route: string };

function describe(p: FUD0448Params): string {
  switch (p.problem) {
    case 'flag-needs-value':
      return `flag --${p.name} needs a value`;
    case 'unknown-flag':
      return `unknown flag --${p.name}`;
    case 'unknown-command':
      return `unknown command "${p.command}"`;
    case 'quote-style':
      return `unknown quote style "${p.value}"`;
    case 'line-terminator':
      return `unknown line terminator "${p.value}"`;
    case 'print-width':
      return '--print-width needs a number';
    case 'tab-width':
      return '--tab-width needs a number';
    case 'new-needs-name':
      return 'fudic new needs a project name';
    case 'package-manager':
      return `unknown package manager "${p.value}"`;
    case 'generate-needs-type':
      return 'fudic g needs a type: page (p), component (c) or layout (l)';
    case 'generate-needs-name':
      return `fudic g ${p.type} needs a name`;
    case 'unknown-type':
      return `unknown type "${p.type}": expected app, lib, page, component or layout`;
    case 'route-segment':
      return `invalid route segment "${p.part}" in "${p.route}"`;
  }
}

/** A CLI usage error: the command line cannot be understood (SDD-22). */
export const FUD0448 = (p: FUD0448Params): ProjectDiagnostic => project('FUD0448', 'error', describe(p));
