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
  /** `--port` that is not a number. */
  | { readonly problem: 'port' }
  /** `--tab-width` that is not a number. */
  | { readonly problem: 'tab-width' }
  /** `fudic new` with no project name. */
  | { readonly problem: 'new-needs-name' }
  /** `--pm` with an unknown package manager. */
  | { readonly problem: 'package-manager'; readonly value: string }
  /** `fudic add` with nothing to add. */
  | { readonly problem: 'add-needs-module' }
  /** `fudic g` with no type. */
  | { readonly problem: 'generate-needs-type' }
  /** `fudic g <type>` with no name. */
  | { readonly problem: 'generate-needs-name'; readonly type: string }
  /** `fudic g` with a type it does not generate. */
  | { readonly problem: 'unknown-type'; readonly type: string }
  /** `fudic g test`: a unit test comes with the piece it tests. */
  | { readonly problem: 'generate-test' }
  /** `fudic g term` with a block that is not given, when or then. */
  | { readonly problem: 'term-block'; readonly value: string }
  /** A route with a segment that cannot be a file name. */
  | { readonly problem: 'route-segment'; readonly part: string; readonly route: string }
  /** An argument a command that takes none was given (`fudic translate x`). */
  | { readonly problem: 'unexpected-argument'; readonly command: string; readonly value: string };

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
    case 'port':
      return '--port needs a number';
    case 'tab-width':
      return '--tab-width needs a number';
    case 'new-needs-name':
      return 'fudic new needs a project name';
    case 'package-manager':
      return `unknown package manager "${p.value}"`;
    case 'add-needs-module':
      return 'fudic add needs to know what to add';
    case 'generate-needs-type':
      return 'fudic generate needs to know what to generate';
    case 'generate-needs-name':
      return `fudic generate ${p.type} needs a name`;
    case 'unknown-type':
      return `fudic does not generate "${p.type}"`;
    case 'generate-test':
      return 'fudic does not generate "test" on its own';
    case 'term-block':
      return `unknown block "${p.value}": expected given, when or then`;
    case 'route-segment':
      return `invalid route segment "${p.part}" in "${p.route}"`;
    case 'unexpected-argument':
      return `fudic ${p.command} takes no argument: "${p.value}"`;
  }
}

/** A CLI usage error: the command line cannot be understood (SDD-22). */
export const FUD0448 = (p: FUD0448Params): ProjectDiagnostic => project('FUD0448', 'error', describe(p));
