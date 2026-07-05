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
});
