// @vitest-environment happy-dom
/**
 * Compiling per locale, end to end (SDD-58 §4.2–§4.8): a `.fud` read through `localizedIo`, the
 * real emit, the server render evaluated, and the client chunk driven over a real DOM — both to
 * CREATE and to HYDRATE what the server painted.
 */

import { browserDom } from '@fudic/dom';
import { describe, expect, it } from 'vitest';
import { adoptOnly, controller, mountAsDsd } from '../emit/hydrate/_harness.js';
import { clientFactory, graphOf, i18nOf, serverHtml, type Table } from './_compile.js';

const ENTRY = '/c/app-x.fud';

const component = (body: string, code = ''): string =>
  `${code}<app-x><template shadowrootmode="open">${body}</template></app-x>`;

let tags = 0;

/** A fresh tag per compile: the client factories are cached by tag in the harness. */
function compile(body: string, code: string, table: Table, locale = 'en', locales = ['es', 'en']) {
  const tag = `app-t${++tags}`;
  const source = component(body, code).replaceAll('app-x', tag);
  const graph = graphOf({ [ENTRY]: source }, ENTRY, i18nOf(table, locale, locales));
  const server = serverHtml(graph, tag);
  const factory = clientFactory(graph, tag);
  const created = (): string => {
    const host = document.createElement(tag);
    const shadow = host.attachShadow({ mode: 'open' });
    document.body.append(host);
    controller(factory, browserDom, shadow, []).c();
    return shadow.innerHTML;
  };
  /** Hydrate without building a node, then apply every value again over what was adopted. */
  const hydrated = (): string => {
    const { shadow } = mountAsDsd(tag, server);
    const ctl = controller(factory, adoptOnly(browserDom), shadow, []);
    ctl.h();
    ctl.u([]);
    return shadow.innerHTML;
  };
  return { server, created, hydrated };
}

const DATA = "@code {\n  const user = { name: 'Ana' };\n  const count = () => 3;\n}\n";
const PHRASE = '<p>Hola <b data-k="x" class="n">@user.name</b>, tienes @count() mensajes</p>';
const SOURCE = 'Hola <0>{name}</0>, tienes {count} mensajes';

describe('criterion 14: a translated phrase', () => {
  const out = compile(PHRASE, DATA, { [SOURCE]: 'Hello <0>{name}</0>, you have {count} messages' });

  it('the server writes it, keeping the attributes of the tag', () => {
    expect(out.server).toBe('<p>Hello <b data-k="x" class="n">Ana</b>, you have 3 messages</p>');
  });

  it('the client creates the same nodes', () => {
    expect(out.created()).toBe(out.server);
  });

  it('hydration adopts them', () => {
    expect(out.hydrated()).toBe(out.server);
  });
});

describe('criterion 15: holes and tags in another order', () => {
  const out = compile(PHRASE, DATA, { [SOURCE]: '{count} messages for <0>{name}</0>' });

  it('are written in the order of the translation', () => {
    expect(out.server).toBe('<p>3 messages for <b data-k="x" class="n">Ana</b></p>');
  });

  it('and the client, creating or hydrating, finds its nodes', () => {
    expect(out.created()).toBe(out.server);
    expect(out.hydrated()).toBe(out.server);
  });
});

describe('criteria 30/31: what the build cannot use falls back to the original, silently', () => {
  it.each<[string, Table]>([
    ['missing', {}],
    ['of another shape', { [SOURCE]: 'Hello {name}' }],
    ['invalid ICU', { [SOURCE]: 'Hello <0>{name}' }],
    ['identical', { [SOURCE]: SOURCE }],
  ])('a translation %s', (_case, table) => {
    const out = compile(PHRASE, DATA, table);
    expect(out.server).toBe('<p>Hola <b data-k="x" class="n">Ana</b>, tienes 3 mensajes</p>');
    expect(out.hydrated()).toBe(out.server);
  });
});

describe('criterion 16: literals in result position', () => {
  it('render translated, with the rest of the expression intact', () => {
    const out = compile('<p>@(ok ? "sí" : "no")</p>', '@code { const ok = true; }\n', { sí: 'yes', no: 'no' });
    expect(out.server).toBe('<p>yes</p>');
    expect(out.created()).toBe(out.server);
  });
});

describe('criterion 20: pipes', () => {
  const CODE = "@code {\n  import { currency } from '@fudic/i18n';\n  const euros = currency('EUR');\n  const precio = 3.5;\n}\n";

  it('3.5 | euros is "3,50 €" in /es and "€3.50" in /en, on the server and in the client', () => {
    const es = compile('<p>@(precio | euros)</p>', CODE, {}, 'es');
    const en = compile('<p>@(precio | euros)</p>', CODE, {}, 'en');

    // The space of `3,50 €` is a no-break space, U+00A0: as the character or as `&nbsp;`.
    const nbsp = (html: string): string => html.replaceAll('&nbsp;', String.fromCharCode(0xa0));
    expect(nbsp(es.server)).toBe(`<p>3,50${String.fromCharCode(0xa0)}€</p>`);
    expect(en.server).toBe('<p>€3.50</p>');
    expect(nbsp(es.created())).toBe(nbsp(es.server));
    expect(en.created()).toBe(en.server);
    expect(en.hydrated()).toBe(en.server);
  });
});

describe('criterion 18: format() and locale', () => {
  it('format(x, euros) formats, and locale is the graph\'s', () => {
    const code =
      "@code {\n  import { currency, format, locale } from '@fudic/i18n';\n  const total = format(2, currency('USD'));\n}\n";
    const out = compile('<p>@total @locale</p>', code, {});
    expect(out.server).toBe('<p>$2.00 en</p>');
  });
});

describe('criterion 17: t()', () => {
  const T = "@code {\n  import { t } from '@fudic/i18n';\n  const name = 'Ana';\n  const n = 1;\n}\n";

  it('a literal and a template literal', () => {
    const out = compile('<p>@t("Acerca de") @t("Hola {name}", { name })</p>', T, {
      'Acerca de': 'About',
      'Hola {name}': 'Hello {name}',
    });
    expect(out.server).toBe('<p>About Hello Ana</p>');
    expect(out.created()).toBe(out.server);
  });

  it('a plural', () => {
    const out = compile('<p>@t("{n} mensajes", { n })</p>', T, {
      '{n} mensajes': '{n, plural, one {# message} other {# messages}}',
    });
    expect(out.server).toBe('<p>1 message</p>');
    expect(out.created()).toBe(out.server);
  });
});

describe('criterion 12, compile side: the source language rewrites its own plural', () => {
  it('with count = 1 the es page says "1 mensaje"', () => {
    const out = compile('<p>Tienes @count mensajes</p>', '@code { const count = 1; }\n', {
      'Tienes {count} mensajes': 'Tienes {count, plural, one {# mensaje} other {# mensajes}}',
    }, 'es');
    expect(out.server).toBe('<p>Tienes 1 mensaje</p>');
    expect(out.created()).toBe(out.server);
  });
});

describe('criterion 29: links', () => {
  it('a static href is prefixed; the exceptions are not', () => {
    const out = compile('<a href="/about">a</a><a href="/es/about">b</a><a href="/doc.pdf">c</a><a href="/_fudic/x">d</a>', '', {});
    expect(out.server).toBe('<a href="/en/about">a</a><a href="/es/about">b</a><a href="/doc.pdf">c</a><a href="/_fudic/x">d</a>');
  });

  it('a dynamic href=@url() with "/about" is "/en/about" on the server and in the client', () => {
    const out = compile('<a href=@url()>x</a>', "@code { const url = () => '/about'; }\n", {});
    expect(out.server).toBe('<a href="/en/about">x</a>');
    expect(out.created()).toBe(out.server);
    expect(out.hydrated()).toBe(out.server);
  });
});
