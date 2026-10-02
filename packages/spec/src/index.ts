/** The extension of a criteria file, sibling of the component it specifies. */
export const SPEC_EXTENSION = '.fudspec';

export type {
  Arg,
  BareArg,
  Block,
  BlockKind,
  ComponentDecl,
  Criterion,
  Name,
  ParseResult,
  RoleArg,
  SpecFile,
  StringArg,
  TermLine,
} from './ast.js';
export { parseSpec } from './parse.js';
