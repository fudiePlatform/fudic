/**
 * The HTML `@raw(expr)` writes (decision 18): one pure function every adapter calls, so the
 * server's string and the browser's `innerHTML` paint the same tree.
 *
 * The opt-out is a mark on the VALUE. What has to hold is that only `trustedHtml(…)` reaches
 * the markup as markup, and that everything else — a string that merely looks like HTML, a
 * forged object, a number — is the text it would have been under `@expr`.
 */

import { describe, expect, it } from 'vitest';
import { browserDom as dom } from '../src/browser.js';
import { htmlOf, isTrustedHtml, trustedHtml } from '../src/html.js';
import * as api from '../src/index.js';

describe('trustedHtml / isTrustedHtml', () => {
  it('marks a string, and the mark is what is recognised', () => {
    const html = trustedHtml('<em>hola</em>');
    expect(isTrustedHtml(html)).toBe(true);
    expect(html.fudicTrustedHtml).toBe('<em>hola</em>');
    expect(String(html)).toBe('<em>hola</em>');
    expect(Object.isFrozen(html)).toBe(true);
  });

  it.each([
    ['a string', '<em>hola</em>'],
    ['null', null],
    ['undefined', undefined],
    ['a number', 1],
    ['a plain object', {}],
    ['an object with the plain name only', { fudicTrustedHtml: '<em>x</em>' }],
    ['a mark that is not a string', { [Symbol.for('fudic.trustedHtml')]: 1 }],
  ])('does not take %s for trusted HTML', (_label, value) => {
    expect(isTrustedHtml(value)).toBe(false);
  });

  it('recognises a mark made by another copy of the module: the symbol is global', () => {
    expect(isTrustedHtml({ [Symbol.for('fudic.trustedHtml')]: '<b>x</b>' })).toBe(true);
  });

  it('is exported from the package entry', () => {
    expect(api.trustedHtml).toBe(trustedHtml);
    expect(api.isTrustedHtml).toBe(isTrustedHtml);
    expect(api.htmlOf).toBe(htmlOf);
  });
});

describe('htmlOf — what reaches the content', () => {
  it('a trusted value is its HTML, verbatim', () => {
    expect(htmlOf(trustedHtml('<h3>T</h3><p>a &amp; b</p>'))).toBe('<h3>T</h3><p>a &amp; b</p>');
  });

  it('anything else is escaped text', () => {
    expect(htmlOf('<b>esto no está marcado</b> & más')).toBe(
      '&lt;b&gt;esto no está marcado&lt;/b&gt; &amp; más',
    );
    expect(htmlOf(42)).toBe('42');
    expect(htmlOf({ fudicTrustedHtml: '<i>x</i>' })).toBe('[object Object]');
  });

  it('null and undefined write nothing (decision 19)', () => {
    expect(htmlOf(null)).toBe('');
    expect(htmlOf(undefined)).toBe('');
  });
});

describe('browserDom.setHtml', () => {
  it('writes trusted HTML as elements, replacing what was there', () => {
    const el = dom.element('div') as Element;
    dom.append(el, dom.element('span'));
    dom.setHtml(el, trustedHtml('<ul><li>uno</li><li>dos</li></ul>'));
    expect(el.innerHTML).toBe('<ul><li>uno</li><li>dos</li></ul>');
    expect(el.querySelectorAll('li')).toHaveLength(2);
    expect(el.querySelector('span')).toBeNull();
  });

  it('writes an unmarked string as text: no element is created', () => {
    const el = dom.element('div') as Element;
    dom.setHtml(el, '<b>esto no está marcado</b>');
    expect(el.textContent).toBe('<b>esto no está marcado</b>');
    expect(el.querySelector('b')).toBeNull();
  });

  it('empties the element for null', () => {
    const el = dom.element('div') as Element;
    dom.setHtml(el, trustedHtml('<i>x</i>'));
    dom.setHtml(el, null);
    expect(el.innerHTML).toBe('');
  });
});
