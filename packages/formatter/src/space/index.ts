/**
 * Whitespace: what it is allowed to become (§4.5), and where a break is a good idea.
 * Canonical re-export.
 */

export { breaksInside, displayOf, isInlineLevel, type Display } from './display.js';
export {
  gapDoc,
  gapOf,
  NO_GAP,
  sequenceOf,
  type ContentSequence,
  type Gap,
  type GapContext,
  type Item,
} from './runs.js';
