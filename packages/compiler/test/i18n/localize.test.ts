/**
 * `localizeSource` (SDD-58 §4.2–§4.8): the `.fud` rewritten for one locale, read as source text.
 * What the rewritten text then renders is `compile.test.ts`.
 */

import { parseSync } from 'oxc-parser';
import { afterEach, describe, expect, it } from 'vitest';
import { isRtl, localizeSource, type LocaleCompile } from '../../src/index.js';
import { i18nOf, type Table } from './_compile.js';

const FILE = 'src/components/app-x.fud';

const component = (body: string, code = ''): string =>
  `${code}<app-x><template shadowrootmode="open">${body}</template></app-x>`;

/** The template's content after the rewrite: what the view became. */
function view(body: string, table: Table, code = '', i18n: LocaleCompile = i18nOf(table)): string {
  const out = localizeSource(component(body, code), FILE, i18n).source;
  return out.slice(out.indexOf('shadowrootmode="open">') + 22, out.lastIndexOf('</template>'));
}

/** The whole rewritten file. */
function whole(source: string, table: Table = {}, i18n: LocaleCompile = i18nOf(table)): string {
  return localizeSource(source, FILE, i18n).source;
}

/** Whether `code` parses as a JS expression. */
function parses(code: string): boolean {
  return parseSync('x.ts', `(${code});`, { sourceType: 'module', lang: 'ts' }).errors.length === 0;
}

const PHRASE = '<p>Hola <b class="n">@user.name</b>, tienes @count() mensajes</p>';

describe('phrases (§4.2)', () => {
  it('criterion 14: the translation, holes as explicit expressions, the tag with its attributes', () => {
    expect(view(PHRASE, { 'Hola <0>{name}</0>, tienes {count} mensajes': 'Hello <0>{name}</0>, you have {count} messages' })).toBe(
      '<p>Hello <b class="n">@(user.name)</b>, you have @(count()) messages</p>',
    );
  });

  it('criterion 15: holes and tags in the order of the translation', () => {
    expect(view(PHRASE, { 'Hola <0>{name}</0>, tienes {count} mensajes': '{count} messages for <0>{name}</0>' })).toBe(
      '<p>@(count()) messages for <b class="n">@(user.name)</b></p>',
    );
  });

  it('the same expression twice in the source is one hole, written wherever the translation puts it', () => {
    expect(view('<p>De @a a @a</p>', { 'De {a} a {a}': '{a} to {a}' })).toBe('<p>@(a) to @(a)</p>');
  });

  it('a hole used twice is its expression twice', () => {
    expect(view('<p>De @a a @b</p>', { 'De {a} a {b}': '{b} ← {a} → {b}' })).toBe('<p>@(b) ← @(a) → @(b)</p>');
  });

  it('nested tags, a void tag, and edge whitespace kept outside the span', () => {
    const body = '<p>\n  Uno <i>dos <b>tres</b></i><br>cuatro\n</p>';
    expect(view(body, { 'Uno <0>dos <1>tres</1></0><2/>cuatro': '<2/>One <0><1>three</1> two</0> four' })).toBe(
      '<p>\n  <br>One <i><b>three</b> two</i> four\n</p>',
    );
  });

  it('a self-closing tag keeps its open span alone', () => {
    expect(view('<p>Hola <span/> mundo</p>', { 'Hola <0></0> mundo': 'Hello <0></0> world' })).toBe(
      '<p>Hello <span/> world</p>',
    );
  });

  it('text is escaped for the markup: & < > { } and @', () => {
    expect(view('<p>Hola</p>', { Hola: "a & b < c > d '{'e'}' f@g" })).toBe(
      '<p>a &#38; b &#60; c &#62; d &#123;e&#125; f@@g</p>',
    );
  });

  it('a plural becomes a call to $message, with the hole expressions, and imports it', () => {
    const out = whole(component('<p>Tienes @count() mensajes</p>'), {
      'Tienes {count} mensajes': 'You have {count, plural, one {# message} other {# messages}}',
    });

    expect(out.startsWith("@code { import { $message } from '@fudic/i18n'; }\n")).toBe(true);
    const call = /@\((\$message\(.*\))\)<\/p>/u.exec(out)![1]!;
    expect(out).toContain('<p>You have @($message(');
    expect(call).toContain('(count())');
    expect(call).toContain('`en`');
    expect(parses(call)).toBe(true);
  });

  describe('falls back to the original, byte for byte (§4.10, criteria 30/31)', () => {
    const source = component(PHRASE);

    it.each<[string, Table]>([
      ['no translation', {}],
      ['the same text as the source', { 'Hola <0>{name}</0>, tienes {count} mensajes': 'Hola <0>{name}</0>, tienes {count} mensajes' }],
      ['a hole missing', { 'Hola <0>{name}</0>, tienes {count} mensajes': 'Hello <0>{name}</0>' }],
      ['a hole renamed', { 'Hola <0>{name}</0>, tienes {count} mensajes': 'Hello <0>{nombre}</0> {count}' }],
      ['a tag missing', { 'Hola <0>{name}</0>, tienes {count} mensajes': 'Hello {name}, {count}' }],
      ['an extra tag', { 'Hola <0>{name}</0>, tienes {count} mensajes': 'Hello <0>{name}</0> <1/> {count}' }],
      ['invalid ICU', { 'Hola <0>{name}</0>, tienes {count} mensajes': 'Hello <0>{name}' }],
    ])('%s', (_case, table) => {
      const out = localizeSource(source, FILE, i18nOf(table));
      expect(out.source).toBe(source);
      for (let i = 0; i < source.length; i += 7) expect(out.map.entryOffset(i)).toBe(i);
    });
  });

  it('asks for each message with the context of the file', () => {
    const i18n = i18nOf({});
    localizeSource('<link rel="layout" href="./l.fud">\n<p>Hola</p>\n', 'src/routes/about.fud', i18n);
    expect(i18n.asked.map((m) => [m.source, m.context])).toEqual([['Hola', 'routes/about.fud']]);
  });
});

describe('the context through relative()', () => {
  it('is the path relative() answers, without src/', () => {
    const base = i18nOf({});
    const i18n: LocaleCompile = { ...base, translate: base.translate, relative: (path) => path.replace('/abs/app/', '') };
    localizeSource('<link rel="layout" href="./l.fud">\n<p>Hola</p>\n', '/abs/app/src/routes/about.fud', i18n);
    expect(base.asked.map((m) => m.context)).toEqual(['routes/about.fud']);
  });
});

describe('attributes (§4.1.2)', () => {
  it('the value in the attribute\'s own quotes, holes as expressions', () => {
    expect(view('<img alt="Foto de @name" title=\'Hola\'>', { 'Foto de {name}': 'Photo of {name}', Hola: 'Hi' })).toBe(
      '<img alt="Photo of @(name)" title=\'Hi\'>',
    );
  });

  it('an unquoted value is quoted', () => {
    expect(view('<input placeholder=Escribe>', { Escribe: 'Type here' })).toBe('<input placeholder="Type here">');
  });

  it('escapes & @ and the quote in use, and leaves the other quote', () => {
    expect(view('<img alt="Hola" title=\'Adiós\'>', { Hola: 'say "hi" & it\'\'s @me', Adiós: 'it\'\'s "bye"' })).toBe(
      '<img alt="say &#34;hi&#34; &#38; it\'s @@me" title=\'it&#39;s "bye"\'>',
    );
  });

  it('keeps the edge whitespace of the value', () => {
    expect(view('<img alt="  Gato  ">', { Gato: 'Cat' })).toBe('<img alt="  Cat  ">');
  });

  it('a translation with a tag or a plural is not written', () => {
    expect(view('<img alt="Hola @n">', { 'Hola {n}': '<0>Hi</0> {n}' })).toBe('<img alt="Hola @n">');
    expect(view('<img alt="Hola @n">', { 'Hola {n}': 'Hi {n, plural, one {#} other {#}}' })).toBe('<img alt="Hola @n">');
  });
});

describe('literals in result position (§4.1.3)', () => {
  it('criterion 16: the arms translated and the rest of the expression identical', () => {
    expect(view('<p>@(ok ? "sí" : "no")</p>', { sí: 'yes', no: 'no' })).toBe('<p>@(ok ? "yes" : "no")</p>');
  });

  it('a template literal keeps the edge whitespace of each fixed part', () => {
    expect(view('<p>@(`Hola ${x} mundo ${y}`)</p>', { Hola: 'Hello', mundo: 'world' })).toBe(
      '<p>@(`Hello ${x} world ${y}`)</p>',
    );
  });

  it('every character that could end a literal is a \\u escape', () => {
    const out = view('<p>@(ok ? "sí" : \'no\')</p>', {
      sí: "\\ \" '' ` $ @ '{' '}' < x",
      no: 'nope',
    });
    const literal = /\(ok \? "(.*)" : 'nope'\)/u.exec(out)![1]!;

    expect(literal).not.toMatch(/["'`$@{}<]/u);
    // eslint-disable-next-line no-new-func
    expect(new Function(`return "${literal}";`)()).toBe("\\ \" ' ` $ @ { } < x");
  });

  it('newlines and the line separators too', () => {
    const out = view('<p>@(ok ? "sí" : "no")</p>', { sí: 'a\nb\rc\u2028d\u2029e' });
    const literal = /\(ok \? "(.*)" : "no"\)/su.exec(out)![1]!;

    expect(literal).not.toMatch(/[\n\r\u2028\u2029]/u);
    // eslint-disable-next-line no-new-func
    expect(new Function(`return "${literal}";`)()).toBe('a\nb\rc\u2028d\u2029e');
  });

  it('a translation with a hole is not written', () => {
    expect(view('<p>@(ok ? "sí" : "no")</p>', { sí: '{x}' })).toBe('<p>@(ok ? "sí" : "no")</p>');
  });
});

describe('t() (§4.3): always rewritten', () => {
  const T = "@code { import { t } from '@fudic/i18n'; }\n";

  it('without holes, a template literal in parentheses', () => {
    expect(view('<p>@t("Acerca de")</p>', { 'Acerca de': 'About' }, T)).toBe('<p>@(`About`)</p>');
  });

  it('missing translation: the author\'s own text — t() would throw at runtime', () => {
    expect(view('<p>@t("Acerca de")</p>', {}, T)).toBe('<p>@(`Acerca de`)</p>');
  });

  it('criterion 17: with holes, a template literal with the expressions', () => {
    expect(view('<p>@t("Hola {name}", { name })</p>', { 'Hola {name}': 'Hello {name}' }, T)).toBe(
      '<p>@(`Hello ${(name)}`)</p>',
    );
    expect(view('<p>@t("Hola {name}", { name: user.name })</p>', {}, T)).toBe('<p>@(`Hola ${(user.name)}`)</p>');
  });

  it('criterion 17: with a plural, $message and its import', () => {
    const out = whole(component('<p>@t("{n} mensajes", { n: count() })</p>', T), {
      '{n} mensajes': '{n, plural, one {# message} other {# messages}}',
    });

    expect(out).toContain("import { $message } from '@fudic/i18n';");
    const call = /<p>@(\(\$message\(.*\)\))<\/p>/u.exec(out)![1]!;
    expect(call).toContain('(count())');
    expect(call.endsWith(',`en`))')).toBe(true);
    expect(parses(call)).toBe(true);
  });

  it('a plural without its key in the object reads undefined', () => {
    const out = whole(component('<p>@t("{n, plural, other {#}}", {})</p>', T));
    expect(out).toContain('(undefined)');
  });

  it('a plural inside a tag is not lost: it still needs $message', () => {
    const out = whole(component('<p>@t("<0>{n, plural, one {# cosa} other {# cosas}}</0>", { n })</p>', T));

    expect(out).toContain('$message(');
    expect(out).toContain('cosas');
  });

  it('empty tags and tags with no plural inside stay a plain template', () => {
    expect(view('<p>@t("<0/>Hola <1>mundo <2>@@</2></1>")</p>', {}, T)).toBe('<p>@(`Hola mundo \\u0040\\u0040`)</p>');
  });

  it('the tags of a message are dissolved into their text', () => {
    expect(view('<p>@t("<0>Hola</0> {n}", { n })</p>', {}, T)).toBe('<p>@(`Hola ${(n)}`)</p>');
  });

  it('special characters of the text are escaped in the template', () => {
    const out = view('<p>@t("Hola")</p>', { Hola: "$'{'x'}' `y` @ '' \\" }, T);
    // eslint-disable-next-line no-new-func
    expect(new Function(`return ${/@\((.*)\)<\/p>/u.exec(out)![1]};`)()).toBe("${x} `y` @ ' \\");
  });

  it('in @code too', () => {
    const out = whole(component('<p>x</p>', "@code { import { t } from '@fudic/i18n'; const e = t('Error'); }\n"), { Error: 'Oops' });
    expect(out).toContain('const e = (`Oops`);');
  });
});

describe('pipes, format() and locale (§4.4)', () => {
  const I = "@code { import { format, locale } from '@fudic/i18n'; }\n";

  it('a | b in the view is $format((b),(a),"en"), and imports it', () => {
    const out = whole(component('<p>@(precio | euros)</p>', I));
    expect(out).toContain('<p>@(($format((euros),(precio),`en`)))</p>');
    expect(out).toContain("import { $format } from '@fudic/i18n';");
  });

  it('nested pipes', () => {
    expect(view('<p>@(a | b | c)</p>', {}, I)).toBe('<p>@(($format((c),(($format((b),(a),`en`))),`en`)))</p>');
  });

  it('a | in @code is the OR of bits', () => {
    expect(whole(component('<p>x</p>', '@code { const m = a | b; }\n'))).toBe(component('<p>x</p>', '@code { const m = a | b; }\n'));
  });

  it('format(x, p) anywhere, @code included; with fewer arguments it is left alone', () => {
    const out = whole(component('<p>@format(x, p)</p>', "@code { import { format } from '@fudic/i18n'; const s = format(1, q); const z = format(1); }\n"));
    expect(out).toContain('const s = ($format((q),(1),`en`));');
    expect(out).toContain('const z = format(1);');
    expect(out).toContain('<p>@($format((p),(x),`en`))</p>');
  });

  it('a format that is not imported is not touched', () => {
    expect(view('<p>@format(x, p)</p>', {})).toBe('<p>@format(x, p)</p>');
  });

  it('locale is "en": a read, a shorthand; not a member, a key or the import', () => {
    const out = whole(
      component(
        '<p>@locale @(obj.locale)</p>',
        "@code { import { locale } from '@fudic/i18n'; const a = { locale }; const b = { locale: 1 }; const c = obj.locale; const d = locale; }\n",
      ),
    );
    expect(out).toContain("import { locale } from '@fudic/i18n';");
    expect(out).toContain('const a = { locale:`en` };');
    expect(out).toContain('const b = { locale: 1 };');
    expect(out).toContain('const c = obj.locale;');
    expect(out).toContain('const d = (`en`);');
    expect(out).toContain('<p>@(`en`) @(obj.locale)</p>');
  });

  it('a renamed import is followed', () => {
    const out = whole(component('<p>@l</p>', "@code { import { locale as l } from '@fudic/i18n'; }\n"));
    expect(out).toContain('<p>@(`en`)</p>');
    expect(out).toContain("import { locale as l } from '@fudic/i18n';");
  });
});

describe('the document (§4.7, §4.8)', () => {
  const LAYOUT = '<!DOCTYPE html>\n<html><head></head><body>@RenderBody()</body></html>\n';

  it('criterion 27: <html> of a layout gets lang', () => {
    expect(whole(LAYOUT)).toBe('<!DOCTYPE html>\n<html lang="en"><head></head><body>@RenderBody()</body></html>\n');
  });

  it('criterion 27: the author\'s lang wins', () => {
    const source = '<!DOCTYPE html>\n<html lang="@culture"><head></head><body>@RenderBody()</body></html>\n';
    expect(whole(source)).toBe(source);
  });

  it('criterion 27: an RTL locale gets dir="rtl", unless the author wrote dir', () => {
    const ar = i18nOf({}, 'ar', ['es', 'ar']);
    expect(whole(LAYOUT, {}, ar)).toContain('<html lang="ar" dir="rtl">');
    expect(whole(LAYOUT.replace('<html>', '<html dir="ltr">'), {}, ar)).toContain('<html lang="ar" dir="ltr">');
    expect(whole(LAYOUT.replace('<html>', '<html lang="ar-EG">'), {}, ar)).toContain('<html dir="rtl" lang="ar-EG">');
    expect(whole(LAYOUT.replace('<html>', '<html lang="x" dir="ltr">'), {}, ar)).toBe(LAYOUT.replace('<html>', '<html lang="x" dir="ltr">'));
  });

  it('a page document too', () => {
    const page = '<!DOCTYPE html>\n<html><head></head><body><p>x</p></body></html>\n';
    expect(whole(page)).toContain('<html lang="en">');
  });

  it('with one locale nothing of the document changes', () => {
    const one = i18nOf({}, 'es', ['es']);
    expect(whole(LAYOUT, {}, one)).toBe(LAYOUT);
    expect(whole(component('<a href="/about">x</a>'), {}, one)).toBe(component('<a href="/about">x</a>'));
  });

  it('criterion 29: a static href gets the prefix', () => {
    expect(view('<a href="/about">x</a><area href=\'/\'><form action="/send"></form>', {})).toBe(
      '<a href="/en/about">x</a><area href=\'/en/\'><form action="/en/send"></form>',
    );
  });

  it('criterion 29: the exceptions stay as they are', () => {
    const body = '<a href="/es/about">a</a><a href="/doc.pdf">b</a><a href="/_fudic/x">c</a><a href="//cdn/x">d</a><a href="about">e</a><a href>f</a><a>g</a><div href="/x"></div><link href="/x">';
    expect(view(body, {})).toBe(body);
  });

  it('an unquoted static href stays unquoted: a prefix adds no character that needs quotes', () => {
    expect(view('<a href=/about>x</a>', {})).toBe('<a href=/en/about>x</a>');
  });

  it('criterion 29: a dynamic href goes through $href at runtime, and imports it', () => {
    const out = whole(component('<a href=@url()>x</a><a href="/blog/@slug?x=@q">y</a>'));
    expect(out).toContain('<a href=@($href((url()),`en`,[`es`,`en`]))>x</a>');
    expect(out).toContain('<a href="@($href(`/blog/${(slug)}?x=${(q)}`,`en`,[`es`,`en`]))">y</a>');
    expect(out).toContain("import { $href } from '@fudic/i18n';");
  });

  it('special characters of the static part of a dynamic href are escaped in its template', () => {
    const out = view('<a href="/a`b/@x">y</a>', {});
    expect(out).toContain('`/a\\u0060b/${(x)}`');
  });

  it('a link inside a translated phrase keeps its prefix', () => {
    expect(view('<p>Ver <a href="/about">más</a></p>', { 'Ver <0>más</0>': 'See <0>more</0>' })).toBe(
      '<p>See <a href="/en/about">more</a></p>',
    );
  });
});

describe('the import of the runtime pieces (§4.6)', () => {
  const PIPE = '<p>@(a | b)</p>';

  it('in a @code of its own when there is none', () => {
    expect(whole(component(PIPE)).startsWith("@code { import { $format } from '@fudic/i18n'; }\n<app-x>")).toBe(true);
  });

  it('after a BOM', () => {
    expect(whole(`﻿${component(PIPE)}`).startsWith("﻿@code { import { $format } from '@fudic/i18n'; }\n")).toBe(true);
  });

  it('before the } of an empty @code', () => {
    expect(whole(component(PIPE, '@code { }\n')).startsWith("@code { import { $format } from '@fudic/i18n';\n}\n")).toBe(true);
  });

  it('at the head of the first part of @code', () => {
    expect(whole(component(PIPE, '@code {\n  const a = 1;\n}\n')).startsWith(
      "@code {import { $format } from '@fudic/i18n';\n\n  const a = 1;\n}\n",
    )).toBe(true);
  });

  it('every piece used, sorted, once', () => {
    const out = whole(component('<p>@(a | b) @(c | d)</p><a href=@u>x</a><p>Hola @n</p>'), {
      'Hola {n}': '{n, plural, other {#}}',
    });
    expect(out.match(/import \{[^}]*\} from '@fudic\/i18n';/gu)).toEqual([
      "import { $format, $href, $message } from '@fudic/i18n';",
    ]);
  });

  it('nothing when nothing calls a piece', () => {
    const source = component('<p>Hola</p>', '@code { const a = 1; }\n');
    expect(whole(source, { Hola: 'Hello' })).toBe(source.replace('Hola', 'Hello'));
  });
});

describe('the map back to the original (§5)', () => {
  it('copied text maps to itself; written text to the start of what it replaced', () => {
    const source = component('<p>Hola mundo</p><i>fin</i>');
    const { source: out, map } = localizeSource(source, FILE, i18nOf({ 'Hola mundo': 'Hello world' }));

    const fin = out.indexOf('fin');
    expect(map.entryOffset(fin)).toBe(source.indexOf('fin'));
    expect(map.entryOffset(out.indexOf('world'))).toBe(source.indexOf('Hola'));
    expect(map.entryOffset(0)).toBe(0);
  });

  it('a copied expression inside a rewritten phrase maps to the expression', () => {
    const source = component('<p>Hola @user.name</p>');
    const { source: out, map } = localizeSource(source, FILE, i18nOf({ 'Hola {name}': '{name}, hello' }));

    expect(out).toContain('@(user.name), hello');
    expect(map.entryOffset(out.indexOf('user.name'))).toBe(source.indexOf('user.name'));
  });
});

describe('isRtl', () => {
  const proto = Intl.Locale.prototype as unknown as Record<string, unknown>;
  const own = Object.getOwnPropertyDescriptor(proto, 'getTextInfo');
  const textInfo = Object.getOwnPropertyDescriptor(proto, 'textInfo');
  afterEach(() => {
    if (own === undefined) delete proto['getTextInfo'];
    else Object.defineProperty(proto, 'getTextInfo', own);
    if (textInfo === undefined) delete proto['textInfo'];
    else Object.defineProperty(proto, 'textInfo', textInfo);
  });

  it.each([
    ['ar', true],
    ['he', true],
    ['fa', true],
    ['en', false],
    ['es', false],
    ['zh-Hant', false],
  ])('%s → %s', (locale, rtl) => {
    expect(isRtl(locale)).toBe(rtl);
  });

  it('falls back to the textInfo getter of older engines', () => {
    Object.defineProperty(proto, 'getTextInfo', { value: undefined, configurable: true });
    Object.defineProperty(proto, 'textInfo', { get: () => ({ direction: 'rtl' }), configurable: true });
    expect(isRtl('en')).toBe(true);
  });

  it('and to ltr when the engine says nothing', () => {
    Object.defineProperty(proto, 'getTextInfo', { value: undefined, configurable: true });
    Object.defineProperty(proto, 'textInfo', { value: undefined, configurable: true });
    expect(isRtl('ar')).toBe(false);
  });
});
