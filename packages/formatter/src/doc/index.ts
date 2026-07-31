/**
 * The document IR and its printer (SDD-26 §1). Canonical re-export: the layout engine is
 * one closed unit, and nothing outside it should reach into either half directly.
 */

export {
  breakParent,
  breaksOf,
  concat,
  empty,
  fill,
  group,
  hardline,
  indent,
  join,
  line,
  softline,
  type BreakParentDoc,
  type ConcatDoc,
  type Doc,
  type DocNode,
  type FillDoc,
  type GroupDoc,
  type IndentDoc,
  type LineDoc,
} from './builders.js';

export { printDoc } from './printer.js';
