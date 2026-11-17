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

  it('writes the class of the spread token by token, at its place by name', () => {
    const d = new SsrDom();
    const el = d.element('div');
    d.setAttrs(el, [{ id: 'x', class: 'a  b', 'aria-label': 'l' }], undefined, []);
    expect(renderToString(el)).toBe('<div aria-label="l" class="a b" id="x"></div>');
  });

  it('a class last or alone in the spread goes in all the same', () => {
    const d = new SsrDom();
    const last = d.element('div');
    d.setAttrs(last, [{ 'aria-label': 'l', class: 'a' }], undefined, []);
    const alone = d.element('div');
    d.setAttrs(alone, [{ class: 'a' }], undefined, []);
    expect(renderToString(last) + renderToString(alone)).toBe('<div aria-label="l" class="a"></div><div class="a"></div>');
  });

  it('a spread with no class leaves alone the `class=""` the element wrote', () => {
    const d = new SsrDom();
    const el = d.element('div');
    d.setAttr(el, 'class', '');
    d.setAttrs(el, [{ id: 'x' }], undefined, ['class']);
    expect(renderToString(el)).toBe('<div class="" id="x"></div>');
  });
});
