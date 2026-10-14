import { describe, expect, test } from 'vitest';
import { forgetShadowInits, recordShadowInits, shadowOf } from '../src/shadow.js';

describe('shadowOf', () => {
  test('reads what attachShadow was asked for, referenceTarget included', () => {
    const host = document.createElement('x-shape');
    host.attachShadow({ mode: 'open', delegatesFocus: true, clonable: true, referenceTarget: 'f' } as ShadowRootInit);
    expect(shadowOf(host)).toEqual({
      mode: 'open',
      delegatesFocus: true,
      clonable: true,
      serializable: false,
      referenceTarget: 'f',
      adoptedStyleSheets: [],
    });
  });

  test('a sheet built from no module style is told as ?', () => {
    const host = document.createElement('x-loose');
    const root = host.attachShadow({ mode: 'open' });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync('b{color:blue}');
    root.adoptedStyleSheets = [sheet];
    expect(shadowOf(host).adoptedStyleSheets).toEqual(['?']);
  });

  test('a host with no shadow root says so', () => {
    expect(() => shadowOf(document.createElement('x-none'))).toThrow('<x-none> has no shadow root');
  });

  test('forgetting drops every init noted so far', () => {
    const host = document.createElement('x-old');
    host.attachShadow({ mode: 'open' });
    forgetShadowInits();
    expect(() => shadowOf(host)).toThrow('<x-old> has no shadow root');
  });

  test('records on any prototype it is handed', () => {
    const proto = { attachShadow: (init: ShadowRootInit) => init } as unknown as Element;
    recordShadowInits(proto);
    expect(proto.attachShadow({ mode: 'open' })).toEqual({ mode: 'open' });
  });
});
