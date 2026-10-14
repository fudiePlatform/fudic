import { describe, expect, test } from 'vitest';
import { mount, renderToHtml, shadowOf, type FudModule, type ShadowShape } from '../../src/index.js';
import { templateAttributes } from '../../src/matchers.js';
import * as Adopt from './src/components/x-tpl-adopt.fud';
import * as All from './src/components/x-tpl-all.fud';
import * as Clonable from './src/components/x-tpl-clonable.fud';
import * as Focus from './src/components/x-tpl-focus.fud';
import * as Plain from './src/components/x-tpl-plain.fud';
import * as Serializable from './src/components/x-tpl-serializable.fud';
import * as Target from './src/components/x-tpl-target.fud';

const NONE: ShadowShape = {
  mode: 'open',
  delegatesFocus: false,
  clonable: false,
  serializable: false,
  referenceTarget: null,
  adoptedStyleSheets: ['self'],
};

/** Each variant, the shape its attributes ask for, and the attributes its template carries. */
const MATRIX: readonly [string, FudModule, ShadowShape, Record<string, string | true>][] = [
  ['no attributes', Plain, NONE, { shadowrootmode: 'open', shadowrootadoptedstylesheets: 'x-tpl-plain' }],
  [
    'shadowrootdelegatesfocus',
    Focus,
    { ...NONE, delegatesFocus: true },
    { shadowrootmode: 'open', shadowrootdelegatesfocus: true, shadowrootadoptedstylesheets: 'x-tpl-focus' },
  ],
  [
    'shadowrootreferencetarget',
    Target,
    { ...NONE, referenceTarget: 'campo' },
    { shadowrootmode: 'open', shadowrootreferencetarget: 'campo', shadowrootadoptedstylesheets: 'x-tpl-target' },
  ],
  [
    'shadowrootadoptedstylesheets',
    Adopt,
    { ...NONE, adoptedStyleSheets: ['panel', 'self'] },
    { shadowrootmode: 'open', shadowrootadoptedstylesheets: 'panel x-tpl-adopt' },
  ],
  [
    'shadowrootclonable',
    Clonable,
    { ...NONE, clonable: true },
    { shadowrootmode: 'open', shadowrootclonable: true, shadowrootadoptedstylesheets: 'x-tpl-clonable' },
  ],
  [
    'shadowrootserializable',
    Serializable,
    { ...NONE, serializable: true },
    { shadowrootmode: 'open', shadowrootserializable: true, shadowrootadoptedstylesheets: 'x-tpl-serializable' },
  ],
  [
    'the four of §6.9 together',
    All,
    { ...NONE, delegatesFocus: true, referenceTarget: 'campo', adoptedStyleSheets: ['panel', 'self'] },
    {
      shadowrootmode: 'open',
      shadowrootdelegatesfocus: true,
      shadowrootreferencetarget: 'campo',
      shadowrootadoptedstylesheets: 'panel x-tpl-all',
    },
  ],
];

describe.each(['ssr', 'client'] as const)('criteria 9 and 10: the shadow root, via %s', (via) => {
  test.each(MATRIX)('%s: the one its attributes ask for', async (_, component, shape) => {
    const t = await mount(component, { via });
    expect(shadowOf(t.host)).toEqual(shape);
  });
});

describe('criterion 11: the contract of the HTML', () => {
  test.each(MATRIX)('%s: exactly its shadowroot* attributes', async (_, component, __, attrs) => {
    expect(await renderToHtml(component)).toContainTemplate(attrs);
  });

  test('one attribute too many fails, and so does one too few', async () => {
    const html = await renderToHtml(Target);
    expect(html).not.toContainTemplate({
      shadowrootmode: 'open',
      shadowrootreferencetarget: 'campo',
      shadowrootadoptedstylesheets: 'x-tpl-target',
      shadowrootclonable: true,
    });
    expect(html).not.toContainTemplate({ shadowrootmode: 'open', shadowrootreferencetarget: 'campo' });
    expect(() =>
      expect(html).toContainTemplate({ shadowrootmode: 'open', shadowrootreferencetarget: 'campo' }),
    ).toThrow('not exactly');
    expect(() =>
      expect(html).not.toContainTemplate({
        shadowrootmode: 'open',
        shadowrootreferencetarget: 'campo',
        shadowrootadoptedstylesheets: 'x-tpl-target',
      }),
    ).toThrow('and it should not');
  });

  test('a page whose body declares no shadow root says so', () => {
    expect(templateAttributes('<html><head></head><body><p>flat</p></body></html>')).toBeNull();
    expect(() => expect('<html><body></body></html>').toContainTemplate({ shadowrootmode: 'open' })).toThrow(
      'the page has no declarative <template> in its body',
    );
  });

  test('renderToHtml takes props, JSON as on the server road', async () => {
    await expect(renderToHtml(Plain, { props: { nope: 1 } })).rejects.toThrow('declares no prop "nope"');
  });
});
