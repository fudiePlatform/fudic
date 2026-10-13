/**
 * `SsrDom.setHtml` — the server half of `@raw(expr)` (decision 18).
 *
 * The browser does `innerHTML = htmlOf(v)`. Here the same string becomes ONE verbatim node
 * that the serializer writes as is, so what Chrome parses out of the response is the tree the
 * client would have built. The node replaces whatever the element held, as `innerHTML` does.
 */

import { describe, expect, it } from 'vitest';
import { trustedHtml } from '@fudic/dom';
import { SsrDom } from '../src/ssr-dom.js';
import { renderToString, serializeChunks } from '../src/serialize.js';

describe('SsrDom.setHtml', () => {
  it('serializes trusted HTML verbatim inside its element', () => {
    const d = new SsrDom();
    const el = d.element('article');
    d.setHtml(el, trustedHtml('<h3>Primer post</h3><p>Con <em>énfasis</em> &amp; más.</p>'));
    expect(renderToString(el)).toBe('<article><h3>Primer post</h3><p>Con <em>énfasis</em> &amp; más.</p></article>');
  });

  it('serializes an unmarked string as escaped text', () => {
    const d = new SsrDom();
    const el = d.element('div');
    d.setHtml(el, '<b>esto no está marcado</b>');
    expect(renderToString(el)).toBe('<div>&lt;b&gt;esto no está marcado&lt;/b&gt;</div>');
  });

  it('writes nothing for null and undefined', () => {
    const d = new SsrDom();
    const el = d.element('div');
    d.setHtml(el, null);
    expect(renderToString(el)).toBe('<div></div>');
    d.setHtml(el, undefined);
    expect(renderToString(el)).toBe('<div></div>');
  });

  it('replaces every child the element held, once and for all', () => {
    const d = new SsrDom();
    const el = d.element('div');
    const old = d.element('span');
    d.append(el, old);
    d.append(el, d.text('x'));
    d.setHtml(el, trustedHtml('<i>uno</i>'));
    d.setHtml(el, trustedHtml('<i>dos</i>'));
    expect(renderToString(el)).toBe('<div><i>dos</i></div>');
    // The node it removed is detached, not left pointing at its old parent.
    const other = d.element('p');
    d.append(other, old);
    expect(renderToString(other)).toBe('<p><span></span></p>');
  });

  it('is one chunk of the stream, between its element´s tags', () => {
    const d = new SsrDom();
    const el = d.element('div');
    d.setHtml(el, trustedHtml('<b>x</b>'));
    expect([...serializeChunks(el)].join('')).toBe('<div><b>x</b></div>');
  });
});
