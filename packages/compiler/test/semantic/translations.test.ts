/**
 * The `translations` analyzer (SDD-58 §3.7): FUD1020 on a `t()` that cannot be extracted, and
 * FUD1021 on a pipe, `t()`, `format()` or `locale` in an app that declares no `locales`.
 */

import { describe, expect, it } from 'vitest';
import { analyze, type SemanticInput } from '../../src/semantic/index.js';
import { viewInput } from './_view.js';

const component = (body: string, code = ''): string =>
  `${code}<app-x><template shadowrootmode="open">${body}</template></app-x>`;

const I18N = "@code {\n  import { t, format, locale, currency } from '@fudic/i18n';\n  const euros = currency('EUR');\n}\n";

/** `[code, the text it underlines]` of the i18n codes, in report order. */
function found(source: string, locales?: boolean, edit: (i: SemanticInput) => SemanticInput = (i) => i): readonly [string, string][] {
  const base = viewInput(source);
  const input = edit(locales === undefined ? base : { ...base, locales });
  return analyze(input)
    .diagnostics.filter((d) => d.code === 'FUD1020' || d.code === 'FUD1021')
    .map((d) => [d.code, source.slice(d.span!.start, d.span!.end)]);
}

describe('FUD1020: a t() the extraction cannot use', () => {
  it('a t(variable) in the view and in @code', () => {
    const source = component('<p>@t(v)</p>', "@code { import { t } from '@fudic/i18n'; const e = t(w); }\n");

    // In source order: the @code comes first.
    expect(found(source)).toEqual([
      ['FUD1020', 'w'],
      ['FUD1020', 'v'],
    ]);
  });

  it('holes without their object', () => {
    const source = component('<p>@t("Hola {name}")</p>', "@code { import { t } from '@fudic/i18n'; }\n");
    expect(found(source)).toEqual([['FUD1020', '"Hola {name}"']]);
  });

  it('is said whatever the app declares', () => {
    const source = component('<p>@t(v)</p>', "@code { import { t } from '@fudic/i18n'; }\n");
    expect(found(source, true)).toEqual([['FUD1020', 'v']]);
  });

  it('nothing when nothing is imported from @fudic/i18n', () => {
    expect(found(component('<p>@t(v)</p>', '@code { const t = (s: string) => s; }\n'))).toEqual([]);
    expect(found(component('<p>@t(v)</p>'))).toEqual([]);
  });

  it('a valid call is fine', () => {
    const source = component('<p>@t("Hola {name}", { name })</p>', "@code { import { t } from '@fudic/i18n'; }\n");
    expect(found(source)).toEqual([]);
  });
});

describe('FUD1021: translating in an app without locales (criterion 22)', () => {
  it('@(precio | euros) is FUD1021 on the pipe', () => {
    const source = component('<p>Total: @(precio | euros)</p>', I18N);
    const reported = analyze({ ...viewInput(source), locales: false }).diagnostics.filter((d) => d.code === 'FUD1021');

    expect(reported).toHaveLength(1);
    expect(reported[0]!.severity).toBe('error');
    expect(reported[0]!.message).toContain('a pipe');
    expect(source.slice(reported[0]!.span!.start, reported[0]!.span!.end)).toBe('precio | euros');
  });

  it('says nothing when the app has locales, or when the host cannot know', () => {
    const source = component('<p>@(precio | euros) @t("Hola") @format(x, euros) @locale</p>', I18N);

    expect(found(source, true)).toEqual([]);
    expect(found(source)).toEqual([]);
  });

  it('every use in the view: a pipe, a t() call, a format() call, a read of locale', () => {
    const source = component('<p>@(precio | euros) @t("Hola") @format(x, euros) @locale</p>', I18N);

    expect(found(source, false)).toEqual([
      ['FUD1021', 'precio | euros'],
      ['FUD1021', 't("Hola")'],
      ['FUD1021', 'format(x, euros)'],
      ['FUD1021', 'locale'],
    ]);
  });

  it('names what was used', () => {
    const source = component('<p>@(a | b) @t("Hola") @format(x, euros) @locale</p>', I18N);
    const messages = analyze({ ...viewInput(source), locales: false })
      .diagnostics.filter((d) => d.code === 'FUD1021')
      .map((d) => d.message);

    expect(messages[0]).toContain('a pipe');
    expect(messages[1]).toContain('`t()`');
    expect(messages[2]).toContain('`format()`');
    expect(messages[3]).toContain('`locale`');
  });

  it('a pipe in every kind of view fragment: attributes, props, headers, keys, cases and render arguments', () => {
    const source = component(
      '<div title=@(a | b) .p=@(c | d)></div>' +
        '@if (e | f) { <i></i> }' +
        '@foreach (const x of xs) key (x | g) { <i></i> }' +
        '@switch (h | i) { case j | k: <i></i> default: <i></i> }' +
        '@render row(l | m)' +
        '<p>@{ const n = o | p; }</p>',
      I18N,
    );

    expect(found(source, false).map(([, text]) => text)).toEqual([
      'a | b',
      'c | d',
      'e | f',
      'x | g',
      'h | i',
      'j | k',
      'l | m',
      'o | p',
    ]);
  });

  it('a | in @code is the OR of bits, not a pipe', () => {
    const source = component('<p>x</p>', "@code { const mask = a | b; }\n");
    expect(found(source, false)).toEqual([]);
  });

  it('uses in @code: calls and reads, with the import itself not one', () => {
    const source = component(
      '<p>x</p>',
      "@code {\n  import { t as tr, format, locale } from '@fudic/i18n';\n  const a = tr('Hola');\n  const b = format(1, p);\n  const c = locale;\n}\n",
    );

    expect(found(source, false)).toEqual([
      ['FUD1021', "tr('Hola')"],
      ['FUD1021', 'format(1, p)'],
      ['FUD1021', 'locale'],
    ]);
  });

  it('a property or a key spelled locale is not a read; shorthand, a computed key and an index are', () => {
    const source = component(
      '<p>x</p>',
      "@code {\n  import { locale } from '@fudic/i18n';\n  const a = obj.locale;\n  const b = { locale: 1 };\n  const c = { locale };\n  const d = { [locale]: 1 };\n  const e = obj[locale];\n}\n",
    );

    expect(found(source, false)).toEqual([
      ['FUD1021', 'locale'],
      ['FUD1021', 'locale'],
      ['FUD1021', 'locale'],
    ]);
    const lines = analyze({ ...viewInput(source), locales: false })
      .diagnostics.filter((d) => d.code === 'FUD1021')
      .map((d) => source.slice(0, d.span!.start).split('\n').length);
    expect(lines).toEqual([5, 6, 7]);
  });

  it('a t or a locale not imported from @fudic/i18n is not one', () => {
    const source = component('<p>@t("Hola") @locale</p>', "@code { const t = (s: string) => s; const locale = 'es'; }\n");
    expect(found(source, false)).toEqual([]);
  });

  it('a fragment the host did not register says nothing', () => {
    const source = component('<p>@(a | b)</p>', I18N);
    expect(found(source, false, (i) => ({ ...i, fragmentId: () => undefined }))).toEqual([]);
  });
});
