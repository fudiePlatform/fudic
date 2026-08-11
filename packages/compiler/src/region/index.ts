/**
 * Where an offset is (BUG-22). Canonical re-export.
 */

export type { CommentPair, CommentSyntax, Region, RegionKind } from './region.js';
export {
  regionAt,
  attributeValueSpan,
  closingTagAt,
  commentSyntaxOf,
  commentSyntaxAt,
} from './region.js';
