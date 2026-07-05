/**
 * `Cursor` — the hydration walk (SDD-14 §3.1). Formalizes the sibling/descendant
 * traversal each `hydrate()` used to do by hand (`[...childNodes].find(...)`,
 * `querySelector('[data-fud-b=...]')`). It wraps the traversal primitives of a
 * `DomClient`, so it is browser-only by construction: `cursorOf` demands a
 * `DomClient<Node>`, which `SsrDom` cannot provide.
 */

import { type DomClient } from './dom.js';

const COMMENT_NODE = 8; // Node.COMMENT_NODE — kept as a local to avoid a global lookup.

export interface Cursor<N> {
  /** The node currently under the cursor (null once the siblings are exhausted). */
  node(): N | null;
  /** Advance to the next sibling. */
  next(): void;
  /** Descend: a new cursor over the children of the current node. */
  enter(): Cursor<N>;
  /** Find (and make current) the first anchor comment with this data; null if absent. */
  seekComment(data: string): N | null;
  /** Find the descendant marked `data-fud-b="<id>"` (reactive node identity, decision 71). */
  byBinding(id: string): N | null;
}

/** Build a cursor over the children of `root`, positioned at its first child. */
export function cursorOf(dom: DomClient<Node>, root: Node): Cursor<Node> {
  return new BrowserCursor(dom, root, dom.firstChild(root));
}

class BrowserCursor implements Cursor<Node> {
  constructor(
    private readonly dom: DomClient<Node>,
    private readonly parent: Node,
    private current: Node | null,
  ) {}

  node(): Node | null {
    return this.current;
  }

  next(): void {
    if (this.current !== null) {
      this.current = this.dom.nextSibling(this.current);
    }
  }

  enter(): Cursor<Node> {
    const into = this.current;
    if (into === null) {
      return new BrowserCursor(this.dom, this.parent, null);
    }
    return new BrowserCursor(this.dom, into, this.dom.firstChild(into));
  }

  seekComment(data: string): Node | null {
    for (let n = this.current; n !== null; n = this.dom.nextSibling(n)) {
      if (n.nodeType === COMMENT_NODE && (n as Comment).data === data) {
        this.current = n;
        return n;
      }
    }
    return null;
  }

  byBinding(id: string): Node | null {
    const scope = this.parent as Partial<ParentNode>;
    if (typeof scope.querySelector !== 'function') {
      return null;
    }
    return scope.querySelector(`[data-fud-b="${id}"]`);
  }
}
