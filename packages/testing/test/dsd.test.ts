import { afterEach, describe, expect, test } from 'vitest';
import { applyDsd, fragmentOf, initOf } from '../src/dsd.js';
import { shadowOf } from '../src/shadow.js';

function template(attrs: string): Element {
  const holder = document.createElement('template');
  holder.innerHTML = `<template ${attrs}></template>`;
  return holder.content.firstElementChild!;
}

afterEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('initOf', () => {
  test('a bare template asks for an open root and nothing else', () => {
    expect(initOf(template(''))).toEqual({ mode: 'open', delegatesFocus: false, clonable: false, serializable: false });
  });

  test('each shadowroot* attribute is its option', () => {
    const init = initOf(
      template('shadowrootdelegatesfocus shadowrootclonable shadowrootserializable shadowrootreferencetarget="campo"'),
    );
    expect(init).toEqual({ mode: 'open', delegatesFocus: true, clonable: true, serializable: true, referenceTarget: 'campo' });
  });
});

describe('applyDsd', () => {
  test('attaches every declarative root, innermost first, and removes its template', () => {
    const order: string[] = [];
    const attach = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (this: Element, init: ShadowRootInit) {
      order.push(this.localName);
      return attach.call(this, init);
    };
    try {
      const html =
        '<x-out><template shadowrootmode="open"><p>out</p>' +
        '<x-in><template shadowrootmode="open" shadowrootreferencetarget="t"><i>in</i></template></x-in>' +
        '</template></x-out>';
      document.body.append(fragmentOf(html));
    } finally {
      Element.prototype.attachShadow = attach;
    }
    expect(order).toEqual(['x-in', 'x-out']);
    const out = document.querySelector('x-out')!;
    expect(out.querySelector('template')).toBeNull();
    expect(out.shadowRoot!.querySelector('p')!.textContent).toBe('out');
    const inner = out.shadowRoot!.querySelector('x-in')!;
    expect(inner.shadowRoot!.querySelector('i')!.textContent).toBe('in');
    expect(shadowOf(inner).referenceTarget).toBe('t');
  });

  test('adopts the sheets it names, in order, skipping one the document does not have', () => {
    document.head.innerHTML =
      '<style type="module" specifier="x-a">p{color:red}</style>' +
      '<style type="module" specifier="theme">p{margin:0}</style>';
    const holder = document.createElement('div');
    holder.innerHTML =
      '<x-a><template shadowrootmode="open" shadowrootadoptedstylesheets="theme gone x-a"><p></p></template></x-a>';
    applyDsd(holder, document);
    expect(shadowOf(holder.querySelector('x-a')!).adoptedStyleSheets).toEqual(['theme', 'self']);
  });
});
