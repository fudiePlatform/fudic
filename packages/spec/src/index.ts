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

export type { Layer, ParamType, TermModule, TermParam } from './term-module.js';
export { readTermModule } from './term-module.js';
export type { SpecFs, TermCatalog, TermRoot } from './catalog.js';
export { createTermCatalog } from './catalog.js';
export type { Fixtures } from './fixtures.js';
export { readFixtures } from './fixtures.js';
export type { ComponentInfo, SpecContext } from './validate.js';
export { normalizeTerm, validateSpec } from './validate.js';

export type { PropField, PropShape } from './scaffold/shape.js';
export { sampleValue } from './scaffold/shape.js';
export { fixtureEntry, fixtureModule } from './scaffold/fixture.js';
export { termModule } from './scaffold/term.js';
export { specSkeleton } from './scaffold/spec.js';
export { closest } from './scaffold/closest.js';
