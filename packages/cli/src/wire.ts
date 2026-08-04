/**
 * `--in` — wiring by span, not by concatenation (SDD-22 §4.4). Inserting a
 * `<link rel="component">` into a foreign file is the CLI's only write over something the
 * user wrote, so it is an insertion at an exact offset: it does not reformat, does not
 * reorder attributes (decision 47), does not normalize whitespace, and touches no line but
 * the one it adds.
 *
 * WHERE it goes is no longer decided here. The editor writes the same link on completion
 * (SDD-28 §3.3), and two copies of a rule that depends on the document role would diverge in
 * silence, so `componentLinkAnchor` moved to `@fudic/compiler` — which is where the roles and
 * the decisions it derives from (53, 59, 83) already live. What stays here is the write: the
 * splice over the text and the idempotency check.
 */

import {
  alreadyLinked,
  componentLinkAnchor,
  componentLinkTag,
  type StructuredDocument,
} from '@fudic/compiler';

// The three names SDD-22 §4.4 published. They are re-exported, not reimplemented: the public
// surface of the CLI does not change because the rule moved house.
export { alreadyLinked, componentLinkAnchor as anchorFor, componentLinkTag };

/**
 * The source with the link inserted, or `null` when it is already there (idempotent: no
 * duplicate, no diagnostic, not reported as a modification).
 */
export function wireComponentLink(source: string, doc: StructuredDocument, href: string): string | null {
  if (alreadyLinked(doc, href)) return null;
  const tag = componentLinkTag(href);
  const { offset, indent } = componentLinkAnchor(source, doc);
  if (offset === 0) return `${tag}\n${source}`;
  return `${source.slice(0, offset)}\n${indent}${tag}${source.slice(offset)}`;
}
