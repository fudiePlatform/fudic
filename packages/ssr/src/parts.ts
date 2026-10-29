/**
 * A body still being built, serialized one part at a time (SDD-70 §3.6).
 *
 * A page with `@await` sends what it has, waits for a field, paints that part into the SAME
 * tree and sends again. The emit only ever appends at its insertion point, so what is built
 * at a cut is the tree minus what comes after that point — and the elements that may still
 * grow are exactly those on the RIGHTMOST path from the root: the insertion point, its
 * ancestors, and the last child chain below it.
 *
 * So `part()` writes everything it has not written yet, leaving the rightmost path open: its
 * start tags go out, its closing tags wait. The next `part()` finds a node that is no longer
 * rightmost — something was appended after it — and closes it then. `end()` closes them all.
 * A node already written is never looked at again, and `part()` + … + `end()` is byte for byte
 * `renderToString` of the finished tree: the same rules, from `serialize.ts`.
 */

import { asImpl, type SsrNode, type SsrNodeImpl } from './tree.js';
import { isRawText, isVoid, openElement, rawChild, serialize } from './serialize.js';

/** Serializes a body that is still being built, one part at a time. */
export interface PartSerializer {
  /** What was appended since the last call; the elements still open stay open. */
  part(): Generator<string>;
  /** The rest, closing every element left open. */
  end(): Generator<string>;
}

export function partSerializer(root: SsrNode): PartSerializer {
  /** Per element or fragment already reached: the first child not yet written whole. */
  const next = new Map<SsrNodeImpl, number>();
  /** The nodes written whole: leaves once written, containers once closed. */
  const done = new Set<SsrNodeImpl>();

  /** `n` from where the last part left it. `open`: it is on the rightmost path, and may grow. */
  function* write(n: SsrNodeImpl, open: boolean, raw: boolean): Generator<string> {
    if (done.has(n)) return;
    if (n.kind === 'text' || n.kind === 'comment' || n.kind === 'html') {
      yield* raw ? rawChild(n) : serialize(n);
      done.add(n);
      return;
    }
    if (!next.has(n)) {
      next.set(n, 0);
      if (n.kind === 'element') {
        yield* openElement(n);
        if (isVoid(n)) {
          done.add(n);
          return;
        }
      }
    }
    const rawChildren = n.kind === 'element' && isRawText(n);
    for (let i = next.get(n)!; i < n.children.length; i++) {
      const last = open && i === n.children.length - 1;
      yield* write(n.children[i]!, last, rawChildren);
      // The last child of an open node may still grow: it is visited again next time.
      next.set(n, last ? i : i + 1);
    }
    if (open) return;
    if (n.kind === 'element') yield `</${n.tag as string}>`;
    done.add(n);
  }

  const top = asImpl(root);
  return {
    part: () => write(top, true, false),
    end: () => write(top, false, false),
  };
}
