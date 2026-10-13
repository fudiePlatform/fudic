/**
 * `browserDom` — the client adapter over the native DOM (SDD-14 §4.2). The only
 * adapter that implements the full `DomClient<Node>` surface: construction plus
 * reactive mutation plus hydration traversal.
 *
 * A direct wrapper (a validated *idea* from the 2019 prototype, never its code):
 * every method is a one-liner over a DOM primitive. No policy lives here.
 */

import { NS, type Ns } from './ns.js';
import { type DomClient } from './dom.js';
import { guardUrl } from './url.js';
import { htmlOf } from './html.js';
import { attrsDiff } from './attrs.js';

export const browserDom: DomClient<Node> = {
  element(tag: string, ns: Ns = 'html'): Node {
    return ns === 'html'
      ? document.createElement(tag)
      : document.createElementNS(NS[ns], tag);
  },
  text(data: string): Node {
    return document.createTextNode(data);
  },
  comment(data: string): Node {
    return document.createComment(data);
  },

  setAttr(el: Node, name: string, value: string): void {
    (el as Element).setAttribute(name, value);
  },
  setUrl(el: Node, name: string, value: unknown): void {
    (el as Element).setAttribute(name, guardUrl((el as Element).localName, name, value));
  },
  setHtml(el: Node, value: unknown): void {
    (el as Element).innerHTML = htmlOf(value);
  },
  setAttrs(el: Node, next: readonly unknown[], prev: readonly unknown[] | undefined, except: readonly string[]): void {
    const element = el as Element;
    const diff = attrsDiff(element.localName, next, prev, except);
    for (const name of diff.remove) element.removeAttribute(name);
    for (const [name, value] of diff.set) element.setAttribute(name, value);
  },
  removeAttr(el: Node, name: string): void {
    (el as Element).removeAttribute(name);
  },
  append(parent: Node, child: Node): void {
    parent.appendChild(child);
  },
  before(anchor: Node, node: Node): void {
    (anchor as ChildNode).before(node);
  },
  remove(node: Node): void {
    (node as ChildNode).remove();
  },
  attachShadow(host: Node, delegatesFocus = false, referenceTarget?: string): Node {
    const el = host as Element;
    // Idempotent: reuse an existing shadow root (e.g. one built by DSD).
    if (el.shadowRoot !== null) return el.shadowRoot;
    // `referenceTarget` is not in every `lib` yet; a browser without the bridge ignores it.
    const init: ShadowRootInit & { referenceTarget?: string } = { mode: 'open', delegatesFocus };
    if (referenceTarget !== undefined) init.referenceTarget = referenceTarget;
    return el.attachShadow(init);
  },
  host(shadow: Node): Node {
    return (shadow as ShadowRoot).host;
  },

  event(node: Node, type: string, cb: (ev: Event) => void): () => void {
    // The SAME reference goes to both calls. Wrapping `cb` to normalize anything would add
    // a frame per dispatch to every binding in the page, and there is nothing to normalize.
    node.addEventListener(type, cb);
    return () => {
      node.removeEventListener(type, cb);
    };
  },
  bus(host: Node, name: string, cb: (ev: Event) => void): () => void {
    // `ownerDocument` and not the global `document`: the same node in any real page, and
    // the only one that exists when the host lives in a document that is not the global one
    // (a test harness, a render off the main document). The semantics SDD-15 §4.4 fixes —
    // a guaranteed common ancestor of the page — are kept whole.
    const doc = host.ownerDocument ?? document;
    doc.addEventListener(name, cb);
    return () => {
      doc.removeEventListener(name, cb);
    };
  },

  setText(node: Node, data: string): void {
    (node as CharacterData).data = data;
  },
  setProp(el: Node, name: string, value: unknown): void {
    (el as unknown as Record<string, unknown>)[name] = value;
  },
  firstChild(node: Node): Node | null {
    return node.firstChild;
  },
  nextSibling(node: Node): Node | null {
    return node.nextSibling;
  },
  previousSibling(node: Node): Node | null {
    return node.previousSibling;
  },
  childAt(node: Node, index: number): Node | null {
    return node.childNodes[index] ?? null;
  },
  firstElementChild(node: Node): Node | null {
    return (node as ParentNode).firstElementChild;
  },
  nextElementSibling(node: Node): Node | null {
    return (node as Element).nextElementSibling;
  },
  lastChild(node: Node): Node | null {
    return node.lastChild;
  },
  textAt(parent: Node, found: Node | null, before: Node | null): Node {
    if (found !== null && found.nodeType === 3) return found; // Node.TEXT_NODE
    // `ownerDocument` for the reason `bus` gives: the parent's document, not the global one.
    const text = (parent.ownerDocument ?? document).createTextNode('');
    parent.insertBefore(text, before);
    return text;
  },
};
