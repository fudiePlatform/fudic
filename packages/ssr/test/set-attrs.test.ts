/**
 * `SsrDom.setAttrs` — the server half of `<input ...resto>`: the same `attrsDiff` the browser
 * applies, written into the node's attributes and serialized like any other.
 */

import { describe, expect, it } from 'vitest';
import { SsrDom } from '../src/ssr-dom.js';
import { renderToString } from '../src/serialize.js';

describe('SsrDom.setAttrs', () => {
  it('serializes what the spread writes, booleans empty and the rest escaped, sorted by name', () => {
    const d = new SsrDom();
    const el = d.element('input');
    d.setAttrs(el, [{ placeholder: 'a "b" & c', required: true, maxlength: 20, hidden: false }], undefined, []);
    expect(renderToString(el)).toBe('<input maxlength="20" placeholder="a &quot;b&quot; &amp; c" required="">');
  });

  it('leaves out what the element writes itself', () => {
    const d = new SsrDom();
    const el = d.element('input');
    d.setAttr(el, 'placeholder', 'mío');
    d.setAttrs(el, [{ placeholder: 'del spread', name: 'n' }], undefined, ['placeholder']);
    expect(renderToString(el)).toBe('<input placeholder="mío" name="n">');
  });

  it('applies a diff too: what the previous objects wrote and these do not is removed', () => {
    const d = new SsrDom();
    const el = d.element('input');
    const prev = [{ required: true, title: 't' }];
    d.setAttrs(el, prev, undefined, []);
    d.setAttrs(el, [{ title: 'u' }], prev, []);
    expect(renderToString(el)).toBe('<input title="u">');
  });
});
