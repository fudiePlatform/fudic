import { describe, it, expect } from 'vitest';
import { browserDom as dom } from '../src/browser.js';
import { cursorOf } from '../src/cursor.js';

/** Builds a shadow root that looks like SSR output: an anchor comment then a
 *  reactive span, the span holding an interpolated text node. */
function ssrShadow(): ShadowRoot {
  const host = dom.element('app-count');
  const root = dom.attachShadow(host) as ShadowRoot;
  dom.append(root, dom.comment('fud:if'));
  const span = dom.element('span');
  dom.setAttr(span, 'data-fud-b', 'count');
  dom.append(span, dom.text('0'));
  dom.append(root, span);
  return root;
}

describe('cursorOf', () => {
  it('starts at the first child', () => {
    const root = ssrShadow();
    const cur = cursorOf(dom, root);
    expect((cur.node() as Comment).data).toBe('fud:if');
  });

  it('seekComment finds the anchor', () => {
    const root = ssrShadow();
    const cur = cursorOf(dom, root);
    const anchor = cur.seekComment('fud:if');
    expect(anchor).not.toBeNull();
    expect(cur.node()).toBe(anchor);
    expect(cur.seekComment('missing')).toBeNull();
  });

  it('byBinding finds the reactive node by identity', () => {
    const root = ssrShadow();
    const cur = cursorOf(dom, root);
    const span = cur.byBinding('count');
    expect((span as Element).tagName.toLowerCase()).toBe('span');
    expect(cur.byBinding('absent')).toBeNull();
  });

  it('next advances through siblings and enter descends', () => {
    const root = ssrShadow();
    const cur = cursorOf(dom, root);
    cur.seekComment('fud:if'); // at the comment
    cur.next(); // at the span
    expect((cur.node() as Element).tagName.toLowerCase()).toBe('span');

    const inner = cur.enter();
    expect((inner.node() as Text).data).toBe('0');
  });

  it('byBinding returns null when the scope has no querySelector', () => {
    // A cursor rooted at a text node: its scope cannot be queried.
    const cur = cursorOf(dom, dom.text('leaf'));
    expect(cur.node()).toBeNull();
    expect(cur.byBinding('count')).toBeNull();
  });

  it('next past the end and enter on null stay safe', () => {
    const root = ssrShadow();
    const cur = cursorOf(dom, root);
    cur.next();
    cur.next();
    cur.next(); // exhausted
    expect(cur.node()).toBeNull();
    expect(cur.enter().node()).toBeNull();
  });
});
