// Reads a page streamed in parts. Each part has an optional block before it and a marker
// after it:
//
//     <script type="application/json" data-fud-part="1">{…}</script>
//     …what part 1 painted…
//     <!--fud-end-->
//
// A part is ready when its marker arrives; the k-th marker closes part k. Both are removed
// once read.

import type { PartBlock } from './maps.js';

export const PART_ATTR = 'data-fud-part';
export const PART_END = 'fud-end';

export interface PartsOptions {
  readonly document: Document;
  /** Called once per part, in order. */
  readonly onPart: (block: PartBlock, index: number) => void;
}

function isEnd(node: Node): node is Comment {
  return node.nodeType === 8 && (node as Comment).data === PART_END;
}

/** Reads every part as it arrives. Resolves once the document has finished loading. */
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

  const sweep = (): void => {
    const walker = doc.createTreeWalker(doc, 128 /* NodeFilter.SHOW_COMMENT */);
    const found: Comment[] = [];
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if (isEnd(node)) found.push(node);
    }
    for (const marker of found) take(marker);
  };

  // Already complete: the runtime ran late, or the page came whole from a cache.
  if (doc.readyState !== 'loading') {
    sweep();
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const observer = new MutationObserver((records) => {
      if (records.some((r) => [...r.addedNodes].some(isEnd))) sweep();
    });
    observer.observe(doc, { childList: true, subtree: true });
    // What arrived before the observer.
    sweep();
    doc.addEventListener('DOMContentLoaded', () => {
      observer.disconnect();
      sweep();
      resolve();
    }, { once: true });
  });
}
