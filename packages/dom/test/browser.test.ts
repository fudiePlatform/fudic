import { describe, it, expect } from 'vitest';
import { NS } from '../src/ns.js';
import { browserDom as dom } from '../src/browser.js';

describe('browserDom construction', () => {
  it('builds an HTML element and appends text', () => {
    const div = dom.element('div');
    dom.append(div, dom.text('x'));
    expect((div as HTMLElement).outerHTML).toBe('<div>x</div>');
  });

  it('creates an element in a non-HTML namespace', () => {
    const svg = dom.element('svg', 'svg');
    expect((svg as Element).namespaceURI).toBe(NS.svg);
  });

  it('creates comment nodes', () => {
    const c = dom.comment('fud:if');
    expect(c.nodeType).toBe(8);
    expect((c as Comment).data).toBe('fud:if');
  });
});

describe('browserDom mutation', () => {
  it('sets and removes attributes', () => {
    const el = dom.element('button') as Element;
    dom.setAttr(el, 'type', 'submit');
    expect(el.getAttribute('type')).toBe('submit');
    dom.removeAttr(el, 'type');
    expect(el.hasAttribute('type')).toBe(false);
  });

  it('setText retouches an existing text node', () => {
    const t = dom.text('0');
    dom.setText(t, '1');
    expect((t as Text).data).toBe('1');
  });

  it('setProp assigns a JS property, not an attribute', () => {
    const el = dom.element('div') as Element & { count?: number };
    dom.setProp(el, 'count', 42);
    expect(el.count).toBe(42);
    expect(el.hasAttribute('count')).toBe(false);
  });
});

describe('browserDom structure', () => {
  it('before inserts a node ahead of the anchor', () => {
    const parent = dom.element('div');
    const anchor = dom.comment('anchor');
    dom.append(parent, anchor);
    const span = dom.element('span');
    dom.before(anchor, span);
    expect((parent as HTMLElement).innerHTML).toBe('<span></span><!--anchor-->');
  });

  it('remove detaches a node', () => {
    const parent = dom.element('div');
    const child = dom.element('span');
    dom.append(parent, child);
    dom.remove(child);
    expect((parent as HTMLElement).innerHTML).toBe('');
  });
});

describe('browserDom shadow', () => {
  it('attachShadow opens a shadow root and is idempotent', () => {
    const host = dom.element('app-x');
    const root = dom.attachShadow(host);
    expect((root as ShadowRoot).mode).toBe('open');
    expect(dom.attachShadow(host)).toBe(root);
  });

  it('host gives the shadow root back its host (SDD-15 §4.4)', () => {
    const host = dom.element('app-x');
    expect(dom.host(dom.attachShadow(host))).toBe(host);
  });
});

describe('browserDom hookup (SDD-15 §3.8)', () => {
  it('event subscribes, and the disposer takes the SAME listener off again', () => {
    const node = dom.element('button');
    let hits = 0;
    const off = dom.event(node, 'click', () => {
      hits += 1;
    });
    (node as HTMLElement).dispatchEvent(new Event('click'));
    off();
    (node as HTMLElement).dispatchEvent(new Event('click'));
    expect(hits).toBe(1);
  });

  it('two subscriptions to the same type give two independent disposers', () => {
    const node = dom.element('button');
    const seen: string[] = [];
    const offA = dom.event(node, 'click', () => seen.push('a'));
    dom.event(node, 'click', () => seen.push('b'));
    offA();
    (node as HTMLElement).dispatchEvent(new Event('click'));
    expect(seen).toEqual(['b']); // taking one off must not take the other with it
  });

  it('bus listens on the host DOCUMENT, not on the host', () => {
    // Emitter and subscriber are siblings: an event bubbling out of the emitter climbs ITS
    // ancestors, so a listener on the subscriber's host would never fire.
    const host = dom.element('shopping-cart');
    document.body.append(host as ChildNode);
    let hits = 0;
    const off = dom.bus(host, 'carrito', () => {
      hits += 1;
    });
    (host as HTMLElement).dispatchEvent(new Event('carrito')); // no bubbling: nothing
    document.dispatchEvent(new Event('carrito'));
    expect(hits).toBe(1);
    off();
    document.dispatchEvent(new Event('carrito'));
    expect(hits).toBe(1);
    (host as ChildNode).remove();
  });

  it('falls back to the global document for a host that IS one', () => {
    // `ownerDocument` is null exactly for a document node; the page still has one ancestor
    // everything shares, and that is the one the bus uses.
    let hits = 0;
    const off = dom.bus(document, 'carrito', () => {
      hits += 1;
    });
    document.dispatchEvent(new Event('carrito'));
    off();
    expect(hits).toBe(1);
  });
});

describe('browserDom traversal', () => {
  it('walks first/next/previous/childAt', () => {
    const parent = dom.element('div');
    const a = dom.element('a');
    const b = dom.element('b');
    const c = dom.element('i');
    dom.append(parent, a);
    dom.append(parent, b);
    dom.append(parent, c);

    expect(dom.firstChild(parent)).toBe(a);
    expect(dom.nextSibling(a)).toBe(b);
    expect(dom.previousSibling(b)).toBe(a);
    expect(dom.childAt(parent, 2)).toBe(c);
    expect(dom.childAt(parent, 3)).toBeNull();
    expect(dom.nextSibling(c)).toBeNull();
  });

  it('walks elements only, stepping over the text between them', () => {
    // The shape hydration actually meets: a tree that went through HTML and back, where
    // the whitespace between the elements is text the parser may have merged into one node
    // or split differently. The element cursor is blind to all of it.
    const parent = dom.element('div');
    const a = dom.element('a');
    const b = dom.element('b');
    dom.append(parent, dom.text(' '));
    dom.append(parent, a);
    dom.append(parent, dom.text(' '));
    dom.append(parent, dom.text(' ')); // two adjacent text nodes: HTML cannot tell them apart
    dom.append(parent, b);
    dom.append(parent, dom.text(' '));

    expect(dom.firstElementChild(parent)).toBe(a);
    expect(dom.nextElementSibling(a)).toBe(b);
    expect(dom.nextElementSibling(b)).toBeNull();
    expect(dom.firstElementChild(a)).toBeNull();
  });

  it('lastChild reaches the trailing text no element follows', () => {
    const parent = dom.element('div');
    const a = dom.element('a');
    const tail = dom.text('x');
    dom.append(parent, a);
    dom.append(parent, tail);

    expect(dom.lastChild(parent)).toBe(tail);
    expect(dom.lastChild(a)).toBeNull();
  });
});
