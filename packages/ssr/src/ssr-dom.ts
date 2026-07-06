/**
 * `SsrDom` — the build adapter (SDD-14 §3.2, §4.3). Implements ONLY `Dom<SsrNode>`
 * (the construction contract), building a detached tree. It does NOT implement
 * `DomClient`: in SSR there is no hydration and no in-place reactive mutation, so
 * there is no traversal or `setText`/`setProp` to offer — and therefore no method
 * that throws. The inability to hydrate in SSR is a property of the type.
 *
 * Parent→child props are resolved by the SSG passing values into the child's
 * `ctx`, not via DOM properties; that is why `setProp` is not part of this
 * contract at all.
 */

import { type Dom, type Ns } from '@fudic/dom';
import { type SsrNode, SsrNodeImpl, asImpl } from './tree.js';

export class SsrDom implements Dom<SsrNode> {
  element(tag: string, ns: Ns = 'html'): SsrNode {
    return SsrNodeImpl.element(tag, ns);
  }
  text(data: string): SsrNode {
    return SsrNodeImpl.leaf('text', data);
  }
  comment(data: string): SsrNode {
    return SsrNodeImpl.leaf('comment', data);
  }

  setAttr(el: SsrNode, name: string, value: string): void {
    asImpl(el).attrs.set(name, value);
  }
  removeAttr(el: SsrNode, name: string): void {
    asImpl(el).attrs.delete(name);
  }

  append(parent: SsrNode, child: SsrNode): void {
    const p = asImpl(parent);
    const c = asImpl(child);
    detach(c);
    c.parent = p;
    p.children.push(c);
  }

  before(anchor: SsrNode, node: SsrNode): void {
    const a = asImpl(anchor);
    const n = asImpl(node);
    const p = a.parent;
    if (p === null) {
      return; // an un-parented anchor has no sibling order to insert into
    }
    detach(n);
    n.parent = p;
    p.children.splice(p.children.indexOf(a), 0, n);
  }

  remove(node: SsrNode): void {
    detach(asImpl(node));
  }

  attachShadow(host: SsrNode): SsrNode {
    const h = asImpl(host);
    if (h.shadow === null) {
      const shadow = SsrNodeImpl.fragment();
      shadow.parent = h;
      h.shadow = shadow;
    }
    return h.shadow;
  }
}

/** Unlink a node from its current parent, if any. */
function detach(n: SsrNodeImpl): void {
  const p = n.parent;
  if (p === null) {
    return;
  }
  const i = p.children.indexOf(n);
  if (i !== -1) {
    p.children.splice(i, 1);
  }
  n.parent = null;
}
