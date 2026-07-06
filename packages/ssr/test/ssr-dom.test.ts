import { describe, it, expect } from 'vitest';
import { SsrDom } from '../src/ssr-dom.js';
import { renderToString } from '../src/serialize.js';

describe('SsrDom tree mutation', () => {
  it('append moves a node out of its previous parent', () => {
    const d = new SsrDom();
    const p1 = d.element('div');
    const p2 = d.element('section');
    const child = d.element('span');
    d.append(p1, child);
    d.append(p2, child); // re-parent
    expect(renderToString(p1)).toBe('<div></div>');
    expect(renderToString(p2)).toBe('<section><span></span></section>');
  });

  it('before inserts a node ahead of the anchor', () => {
    const d = new SsrDom();
    const parent = d.element('div');
    const anchor = d.comment('anchor');
    d.append(parent, anchor);
    d.before(anchor, d.element('span'));
    expect(renderToString(parent)).toBe('<div><span></span><!--anchor--></div>');
  });

  it('before on an un-parented anchor is a no-op', () => {
    const d = new SsrDom();
    const parent = d.element('div');
    d.append(parent, d.text('x'));
    const orphanAnchor = d.comment('orphan');
    const node = d.element('span');
    d.before(orphanAnchor, node);
    expect(renderToString(parent)).toBe('<div>x</div>');
  });

  it('remove detaches a node', () => {
    const d = new SsrDom();
    const parent = d.element('div');
    const child = d.element('span');
    d.append(parent, child);
    d.remove(child);
    expect(renderToString(parent)).toBe('<div></div>');
  });

  it('remove on an un-parented node is a no-op and does not throw', () => {
    const d = new SsrDom();
    const orphan = d.element('span');
    expect(() => d.remove(orphan)).not.toThrow();
    expect(renderToString(orphan)).toBe('<span></span>');
  });

  it('removeAttr deletes an attribute', () => {
    const d = new SsrDom();
    const el = d.element('input');
    d.setAttr(el, 'disabled', '');
    d.removeAttr(el, 'disabled');
    expect(renderToString(el)).toBe('<input>');
  });

  it('attachShadow is idempotent', () => {
    const d = new SsrDom();
    const host = d.element('app-x');
    const first = d.attachShadow(host);
    expect(d.attachShadow(host)).toBe(first);
  });

  it('detaching a node held outside its parent children list is safe', () => {
    // A shadow root is parented to its host but lives in `.shadow`, not `children`.
    const d = new SsrDom();
    const host = d.element('app-x');
    const shadow = d.attachShadow(host);
    expect(() => d.remove(shadow)).not.toThrow();
  });
});
