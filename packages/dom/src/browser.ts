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
  attachShadow(host: Node): Node {
    const el = host as Element;
    // Idempotent: reuse an existing shadow root (e.g. one built by DSD).
    return el.shadowRoot ?? el.attachShadow({ mode: 'open' });
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
};
