/**
 * What a spread on a native element writes — `<input ...resto>` — decided by one pure
 * function every adapter calls, so the server and the browser write the same attributes.
 *
 * `attrsOf` is the WHAT (which names, with which text); `attrsDiff` is the HOW MUCH (from what
 * the spread wrote last to what it writes now). Both are checked on plain objects; then
 * `browserDom.setAttrs` applies a diff on a real element, which is where a removal shows.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserDom as dom } from '../src/browser.js';
import { attrsDiff, attrsOf } from '../src/attrs.js';
import { INERT_URL, trustedUrl } from '../src/url.js';
import * as api from '../src/index.js';

const of = (objects: readonly unknown[], except: readonly string[] = [], tag = 'input'): Record<string, string> =>
  Object.fromEntries(attrsOf(tag, objects, except));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('attrsOf — what a value becomes', () => {
  it('a string, a number and a bigint are their text; true is the empty boolean value', () => {
    expect(of([{ placeholder: 'Nombre', maxlength: 20, size: 3n, required: true }])).toEqual({
      placeholder: 'Nombre',
      maxlength: '20',
      size: '3',
      required: '',
    });
  });

  it('false, null and undefined leave the attribute out', () => {
    expect(of([{ required: false, placeholder: null, title: undefined }])).toEqual({});
  });

  it('an object, a function and a symbol are no attribute', () => {
    expect(of([{ title: {}, alt: () => 1, name: Symbol('x'), list: [1] }])).toEqual({});
  });

  it('a value that is not an object reads nothing: null, a string, a number', () => {
    expect(of([null, undefined, 'abc', 42, { a: '1' }])).toEqual({ a: '1' });
  });
});

describe('attrsOf — what a spread may never write', () => {
  it('an on* handler, in any case', () => {
    expect(of([{ onclick: 'x()', ONLOAD: 'y()', onFocus: 'z', title: 't' }])).toEqual({ title: 't' });
  });

  it('a name that is not a plain attribute name', () => {
    expect(of([{ 'a b': '1', '1x': '1', '"q': '1', '': '1', 'data-x': 'ok', 'xlink:href': '/a', 'a.b': 'ok', _u: 'ok' }], [], 'a')).toEqual({
      'data-x': 'ok',
      'xlink:href': '/a',
      'a.b': 'ok',
      _u: 'ok',
    });
  });
});

describe('attrsOf — URL attributes go through the guard', () => {
  it('an unsafe scheme is made inert, a safe one is left alone', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(of([{ href: 'javascript:alert(1)', title: 'javascript:ok' }], [], 'a')).toEqual({
      href: INERT_URL,
      title: 'javascript:ok', // not a URL attribute: written as text
    });
    expect(of([{ href: 'https://a.b/x' }], [], 'a')).toEqual({ href: 'https://a.b/x' });
  });

  it('a trustedUrl crosses on a URL attribute, and is skipped as an object anywhere else', () => {
    const url = trustedUrl('miapp:abrir');
    expect(of([{ href: url, title: url }], [], 'a')).toEqual({ href: 'miapp:abrir' });
  });

  it('`data` is a URL attribute on <object> only, in any case', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(of([{ data: 'javascript:x' }], [], 'OBJECT')).toEqual({ data: INERT_URL });
    expect(of([{ data: 'javascript:x' }], [], 'div')).toEqual({ data: 'javascript:x' });
    expect(of([{ HREF: 'javascript:x' }], [], 'a')).toEqual({ HREF: INERT_URL });
  });
});

describe('attrsOf — the element and the order decide', () => {
  it('a name the element writes itself is left out, in any case', () => {
    expect(of([{ placeholder: 'a', Title: 't', name: 'n' }], ['PLACEHOLDER', 'title'])).toEqual({ name: 'n' });
  });

  it('of two objects, the later wins a key it writes; one it leaves out keeps the earlier', () => {
    expect(of([{ a: '1', b: '1', c: '1' }, { a: '2', b: undefined, c: false }])).toEqual({ a: '2', b: '1', c: '1' });
  });

  it('writes the names sorted, in UTF-16 code units, whichever object brought them (SDD-61 §3.8)', () => {
    const names = [...attrsOf('a', [{ title: 't', href: '/x', Zeta: 'z' }, { rel: 'r', hidden: true, title: 'u' }], []).keys()];
    expect(names).toEqual(['Zeta', 'hidden', 'href', 'rel', 'title']);
  });

  it('a diff sets in that same order', () => {
    expect(attrsDiff('a', [{ title: 't', href: '/x' }, { rel: 'r' }], undefined, []).set.map(([n]) => n)).toEqual([
      'href',
      'rel',
      'title',
    ]);
  });
});

describe('attrsDiff — from what was written to what is', () => {
  it('the first time, everything is a set and nothing is removed', () => {
    expect(attrsDiff('input', [{ a: '1', b: true }], undefined, [])).toEqual({
      set: [
        ['a', '1'],
        ['b', ''],
      ],
      remove: [],
    });
  });

  it('only what changed its text is set; what is no longer written is removed', () => {
    const prev = [{ placeholder: 'A', required: true, maxlength: 20 }];
    const next = [{ placeholder: 'B', required: false, maxlength: 20 }];
    expect(attrsDiff('input', next, prev, [])).toEqual({ set: [['placeholder', 'B']], remove: ['required'] });
  });

  it('the except list is honoured on both sides: an explicit attribute is never removed', () => {
    expect(attrsDiff('input', [{}], [{ title: 'x' }], ['title'])).toEqual({ set: [], remove: [] });
  });

  it('re-reads the previous URLs without warning again', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const bad = [{ href: 'javascript:x' }];
    attrsDiff('a', bad, undefined, []);
    const before = warn.mock.calls.length;
    expect(attrsDiff('a', [{}], bad, [])).toEqual({ set: [], remove: ['href'] });
    expect(warn.mock.calls.length).toBe(before);
  });

  it('is exported from the package entry', () => {
    expect(api.attrsOf).toBe(attrsOf);
    expect(api.attrsDiff).toBe(attrsDiff);
  });
});

describe('browserDom.setAttrs', () => {
  it('writes the spread, then takes off what it no longer writes and leaves the rest', () => {
    const el = dom.element('input') as Element;
    el.setAttribute('class', 'mine'); // written some other way: never the spread's
    const first = [{ placeholder: 'A', required: true, maxlength: 20 }];
    dom.setAttrs(el, first, undefined, []);
    expect(el.getAttribute('placeholder')).toBe('A');
    expect(el.getAttribute('required')).toBe('');
    expect(el.getAttribute('maxlength')).toBe('20');

    dom.setAttrs(el, [{ placeholder: 'B', required: false, maxlength: 20 }], first, []);
    expect(el.getAttribute('placeholder')).toBe('B');
    expect(el.hasAttribute('required')).toBe(false);
    expect(el.getAttribute('maxlength')).toBe('20');
    expect(el.getAttribute('class')).toBe('mine');
  });
});
