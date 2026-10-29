/**
 * The reader of a page that arrives in parts (SDD-70 §4.4).
 *
 * Each part carries one block in front of it and a marker behind it:
 *
 *     <script type="application/json" data-fud-part="1">{…}</script>
 *     …what part 1 painted…
 *     <!--fud-end-->
 *
 * A part is READY when its marker arrives: the parser has read everything before it, the
 * block included. The block is optional — a part with nothing to say writes none — so it is
 * the k-th marker that closes part k, and the block is looked up by that index.
 *
 * Both are removed the moment they are read. What they said lives in memory from then on,
 * which is the maps' business and not this module's: this one only watches the document.
 *
 * A piece of its own, which only a route with `@await` asks for (SDD-70 §4.5): a page without
 * one downloads exactly what it did before.
 */

import type { PartBlock } from './maps.js';

/** The attribute of a part's block, and the text of the marker that closes the part. */
export const PART_ATTR = 'data-fud-part';
export const PART_END = 'fud-end';

export interface PartsOptions {
  readonly document: Document;
  /** Called once per part, in order, when its marker has arrived. */
  readonly onPart: (block: PartBlock, index: number) => void;
}

/** Whether a node is the marker that closes a part. */
function isEnd(node: Node): node is Comment {
  return node.nodeType === 8 && (node as Comment).data === PART_END;
}

/**
 * Read every part of the document as it arrives, and resolve once the last one is in.
 *
 * With the document still loading, a `MutationObserver` hears each marker the parser inserts;
 * with it already complete — the runtime ran late, or the page came whole from a cache — the
 * parts are all there and are read in one go.
 */
export function readParts({ document: doc, onPart }: PartsOptions): Promise<void> {
  let next = 0;

  const take = (marker: Comment): void => {
    const el = doc.querySelector(`script[${PART_ATTR}="${next}"]`);
    const block = el === null ? {} : (JSON.parse(String(el.textContent)) as PartBlock);
    el?.remove();
    marker.remove();
    onPart(block, next);
    next += 1;
  };

  /** Every marker still in the document, in document order. */
  const sweep = (): void => {
    const walker = doc.createTreeWalker(doc, 128 /* NodeFilter.SHOW_COMMENT */);
    const found: Comment[] = [];
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if (isEnd(node)) found.push(node);
    }
    for (const marker of found) take(marker);
  };

  if (doc.readyState !== 'loading') {
    sweep();
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const observer = new MutationObserver((records) => {
      // Only a marker closes a part: any other node the parser added waits for one.
      if (records.some((r) => [...r.addedNodes].some(isEnd))) sweep();
    });
    observer.observe(doc, { childList: true, subtree: true });
    // What arrived before the observer did.
    sweep();
    doc.addEventListener('DOMContentLoaded', () => {
      observer.disconnect();
      sweep();
      resolve();
    }, { once: true });
  });
}
