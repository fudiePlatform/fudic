import { readFileSync } from 'node:fs';
import { messageKey } from '@fudic/i18n';
import { describe, expect, it } from 'vitest';
import { contextOf, extractMessages, extractScriptMessages, type Message } from '../../src/index.js';
import { structureDocument } from '../../src/document/index.js';
import { parseDocument } from '../../src/html/index.js';
import { atConstructs } from '../../src/constructs.js';

const FILE = 'src/components/app-x.fud';

/** A component whose template holds `body`, with `code` in front of it. */
const component = (body: string, code = ''): string =>
  `${code}<app-x><template shadowrootmode="open">${body}</template></app-x>`;

const IMPORT_T = "@code { import { t } from '@fudic/i18n'; }\n";

function extract(source: string, file = FILE): ReturnType<typeof extractMessages> {
  return extractMessages(source, file);
}

/** The sources of the messages of `source`, in order. */
function sources(source: string, file = FILE): readonly string[] {
  return extract(source, file).value.map((m) => m.source);
}

/** The text a span covers. */
const slice = (source: string, at: { readonly start: number; readonly end: number }): string => source.slice(at.start, at.end);

function only(source: string): Message {
  const { value } = extract(source);
  expect(value).toHaveLength(1);
  return value[0]!;
}

describe('criterion 2: the fixture app-card', () => {
  it('gives "Cerrar" and "Abrir" in the context app-card, at 0 and 1', () => {
    const source = readFileSync(new URL('../../fixtures/app-card.fud', import.meta.url), 'utf8');
    const { value, diagnostics } = extractMessages(source, 'src/components/app-card.fud');

    expect(diagnostics).toEqual([]);
    expect(value.map((m) => [m.source, m.context, m.at, m.origin])).toEqual([
      ['Cerrar', 'app-card', 0, 'text'],
      ['Abrir', 'app-card', 1, 'text'],
    ]);
    expect(value.map((m) => slice(source, m.span))).toEqual(['Cerrar', 'Abrir']);
    expect(value[0]!.key).toBe(messageKey('app-card', 'Cerrar'));
  });
});

describe('the phrase is the unit (§4.2)', () => {
  it('criterion 3: one message with a tag and two holes', () => {
    const source = component('<p>Hola <b>@user.name</b>, tienes @count() mensajes</p>');
    const m = only(source);

    expect(m.source).toBe('Hola <0>{name}</0>, tienes {count} mensajes');
    expect(m.origin).toBe('text');
    expect(m.tags).toBe(1);
    expect(m.holes.map((h) => [h.name, slice(source, h.expr)])).toEqual([
      ['name', 'user.name'],
      ['count', 'count()'],
    ]);
    expect(slice(source, m.span)).toBe('Hola <b>@user.name</b>, tienes @count() mensajes');
  });

  it('tags are numbered by opening order; br and wbr are empty tags; nesting is kept', () => {
    expect(sources(component('<p>Uno <i>dos <b>tres</b></i> cuatro<br>cinco<wbr><em>seis</em></p>'))).toEqual([
      'Uno <0>dos <1>tres</1></0> cuatro<2/>cinco<3/><4>seis</4>',
    ]);
  });

  it('a self-closing phrasing element is an empty pair', () => {
    expect(sources(component('<p>Hola <span/> mundo</p>'))).toEqual(['Hola <0></0> mundo']);
  });

  it('@@ is an @', () => {
    expect(sources(component('<p>Escribe a hola@@fudic.dev</p>'))).toEqual(['Escribe a hola@fudic.dev']);
  });

  it('whitespace is collapsed and the span leaves the edges out', () => {
    const source = component('<p>\n    Hola\n    mundo   \n</p>');
    const m = only(source);

    expect(m.source).toBe('Hola mundo');
    expect(slice(source, m.span)).toBe('Hola\n    mundo');
  });

  it('literal braces and apostrophes are ICU-escaped', () => {
    expect(sources(component("<p>It's {not} a hole, nor &lt;0&gt;</p>"))).toEqual([
      "It''s '{'not'}' a hole, nor &lt;0&gt;",
    ]);
  });

  it('so is tag-like text in an attribute', () => {
    expect(sources(component('<img alt="a <0> b </1> c">'))).toEqual(["a '<'0> b '<'/1> c"]);
  });

  it('a block element cuts the run into separate messages', () => {
    expect(sources(component('<div>Uno<div>Dos</div>Tres</div>'))).toEqual(['Uno', 'Dos', 'Tres']);
  });

  it('a phrasing element holding a block is not inline: it cuts the run', () => {
    expect(sources(component('<p>Antes <span>dentro <div>bloque</div></span> después</p>'))).toEqual([
      'Antes',
      'dentro',
      'bloque',
      'después',
    ]);
  });

  it('a component tag, @render, @{ } and a comment cut the run', () => {
    const source = component(
      '<p>Uno <app-y>Dos</app-y> Tres @render row() Cuatro @{ const z = 1; } Cinco <!-- Nota --> Seis</p>',
    );

    expect(sources(source)).toEqual(['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis']);
  });

  it('a run with no letter is not a message: spaces, numbers, signs or holes only', () => {
    expect(sources(component('<p> 42 — @count </p><p><b>@a</b> + 1</p><p>   </p>'))).toEqual([]);
  });

  it('criterion 7: a nav with twenty-two links gives twenty-two messages', () => {
    const links = Array.from({ length: 22 }, (_, i) => `<a href="/p${i}">Página ${i}</a>`).join('\n  ');
    const source = component(`<nav>\n  ${links}\n</nav>`);
    const { value } = extract(source);

    expect(value).toHaveLength(22);
    expect(value.map((m) => m.source)).toEqual(Array.from({ length: 22 }, (_, i) => `Página ${i}`));
    expect(value.map((m) => m.at)).toEqual(Array.from({ length: 22 }, (_, i) => i));
  });

  it('a list of elements recurses into each one', () => {
    expect(sources(component('<nav><a>Uno <b>dos</b></a> <a><span>Tres</span></a></nav>'))).toEqual([
      'Uno <0>dos</0>',
      'Tres',
    ]);
  });

  it('a list of elements says each attribute and each result literal once', () => {
    const source = component('<nav><a>Uno <b title="Hola">x</b></a> <a>@(ok ? "Sí" : "No")</a></nav>');

    expect(sources(source)).toEqual(['Uno <0>x</0>', 'Hola', 'Sí', 'No']);
  });

  it('elements separated by text with letters are one phrase', () => {
    expect(sources(component('<p><a>Uno</a> y <a>dos</a></p>'))).toEqual(['<0>Uno</0> y <1>dos</1>']);
  });
});

describe('hole names (§4.2)', () => {
  it('a path, a signal read, a pipe; argN for anything else; suffixes for collisions', () => {
    const source = component(
      '<p>Ver @a @b.c @d() @e.f() @(x | y) @(1+2) @(g(1)) @(h[0]) @a @(a.b.a) @(k.id) @(m.id) @(n.id) @(this.#p) @((a || b)()) @(a + b) @(z!)</p>',
    );
    const m = only(source);

    expect(m.holes.map((h) => [h.name, slice(source, h.expr)])).toEqual([
      ['a', 'a'],
      ['c', 'b.c'],
      ['d', 'd()'],
      ['f', 'e.f()'],
      ['x', 'x | y'],
      ['arg1', '1+2'],
      ['arg2', 'g(1)'],
      ['arg3', 'h[0]'],
      ['a2', 'a.b.a'],
      ['id', 'k.id'],
      ['id2', 'm.id'],
      ['id3', 'n.id'],
      ['arg4', 'this.#p'],
      ['arg5', '(a || b)()'],
      ['arg6', 'a + b'],
      ['z', 'z!'],
    ]);
    expect(m.source).toBe(
      'Ver {a} {c} {d} {f} {x} {arg1} {arg2} {arg3} {a} {a2} {id} {id2} {id3} {arg4} {arg5} {arg6} {z}',
    );
  });

  it('argN is counted per message', () => {
    const { value } = extract(component('<p>Uno @(1+2)</p><p>Dos @(3+4)</p>'));

    expect(value.map((m) => m.source)).toEqual(['Uno {arg1}', 'Dos {arg1}']);
  });

  it('an expression with no AST is argN', () => {
    expect(sources(component('<p>Hola @() mundo</p>'))[0]).toMatch(/^Hola \{arg1\}/u);
  });
});

describe('what is not translated (§4.1)', () => {
  it('criterion 6: translate="no" hides the element and everything inside it', () => {
    expect(sources(component('<code translate="no">pnpm dev</code>'))).toEqual([]);
    expect(
      sources(component('<div translate="no" title="Título">Nada <p>tampoco @(ok ? "sí" : "no")</p></div>')),
    ).toEqual([]);
  });

  it('translate="no" inside a phrase cuts it', () => {
    expect(sources(component('<p>Ejecuta <code translate="no">pnpm dev</code> ahora</p>'))).toEqual([
      'Ejecuta',
      'ahora',
    ]);
  });

  it('<style>, <script>, @raw and comments say nothing', () => {
    const source = component(
      '<style>p::before { content: "Hola"; }</style><script>alert("Hola")</script><!-- Hola --><p>@raw("<b>Hola</b>")</p>',
    );

    expect(sources(source)).toEqual([]);
  });

  it('a prop is not text: it takes t()', () => {
    expect(sources(component('<app-y .title="Acerca de" title2="Nope"></app-y>'))).toEqual([]);
  });
});

describe('constructs: each branch is its own list', () => {
  it('if / else if / else, foreach, for, while and switch', () => {
    const source = component(
      '@if (a) { Sí } else if (b) { Quizá } else { No }' +
        '@foreach (const x of xs) key (x) { Item }' +
        '@for (let i = 0; i < n; i++) key (i) { Vuelta }' +
        '@while (go) key (k) { Mientras }' +
        '@switch (k) { case 1: <b>Uno</b> default: <i>Otro</i> }',
    );
    const { value, diagnostics } = extract(source);

    expect(diagnostics).toEqual([]);
    expect(value.map((m) => m.source)).toEqual(['Sí', 'Quizá', 'No', 'Item', 'Vuelta', 'Mientras', 'Uno', 'Otro']);
  });

  it('an if without else', () => {
    expect(sources(component('<div>@if (a) { <p>Solo</p> }</div>'))).toEqual(['Solo']);
  });

  it('the sections of a route and the bodies of snippets', () => {
    const route = '<link rel="layout" href="./_layout.fud">\n<h1>Título</h1>\n@section cabecera { <p>Sección</p> }\n';
    const route2 = extract(route, 'src/routes/about.fud');
    expect(route2.value.map((m) => [m.source, m.context])).toEqual([
      ['Título', 'routes/about.fud'],
      ['Sección', 'routes/about.fud'],
    ]);

    const snippets = '@snippet row(label: string) {\n  <div>Fila @label</div>\n}\n';
    expect(extract(snippets, 'src/snippets/ui.fud').value.map((m) => [m.source, m.context])).toEqual([
      ['Fila {label}', 'snippets/ui.fud'],
    ]);
  });
});

describe('attributes (§4.1.2)', () => {
  it('criterion 5: placeholder is, class is not', () => {
    const source = component('<input placeholder="Escribe"><input class="campo">');
    const m = only(source);

    expect([m.source, m.origin, slice(source, m.span)]).toEqual(['Escribe', 'attribute', 'Escribe']);
  });

  it('criterion 5: the value of a submit is, the value of a text input is not', () => {
    expect(sources(component('<input type="submit" value="Enviar">'))).toEqual(['Enviar']);
    expect(sources(component('<input type="text" value="x">'))).toEqual([]);
  });

  it('an expression inside the value is a hole', () => {
    const source = component('<img alt="Foto de @user.name">');
    const m = only(source);

    expect(m.source).toBe('Foto de {name}');
    expect(m.holes.map((h) => slice(source, h.expr))).toEqual(['user.name']);
  });

  it('a value with no letter is not a message', () => {
    expect(sources(component('<img alt="@name"><img alt="42"><img alt>'))).toEqual([]);
  });

  it('the span leaves the edge whitespace out', () => {
    const source = component('<img alt="  Gato  ">');
    expect(slice(source, only(source).span)).toBe('Gato');
  });

  it('an attribute of a phrasing element is its own message, after or inside the phrase', () => {
    expect(sources(component('<p>Ver <a title="Perfil">aquí</a></p>'))).toEqual(['Ver <0>aquí</0>', 'Perfil']);
  });
});

describe('literals in result position (§4.1.3)', () => {
  it('criterion 4: both arms of ?: are messages', () => {
    const source = component('<p>@(ok ? "sí" : "no")</p>');
    const { value } = extract(source);

    expect(value.map((m) => [m.source, m.origin, slice(source, m.span)])).toEqual([
      ['sí', 'result', 'sí'],
      ['no', 'result', 'no'],
    ]);
  });

  it('criterion 4: a literal compared inside the expression is a value', () => {
    expect(sources(component('<p>@(items.filter(x => x.tipo === "activo").length)</p>'))).toEqual([]);
  });

  it('criterion 4: a non-translatable attribute is not walked', () => {
    expect(sources(component('<div class=@(ok ? "a" : "b")></div>'))).toEqual([]);
  });

  it('the right of ?? || &&, recursively, through parentheses and as', () => {
    const source = component('<p>@(a ?? "x") @(b || "y") @(c && "z") @(d ? ("u" as string) : e ?? "w")</p>');

    expect(sources(source)).toEqual(['x', 'y', 'z', 'u', 'w']);
  });

  it('not the left of ??, nor an operand, nor an argument, nor a number', () => {
    expect(sources(component('<p>@("a" ?? b) @(a + "b") @(f("c")) @(ok ? 1 : 2)</p>'))).toEqual([]);
  });

  it('the fixed parts of a template literal, with or without expressions', () => {
    const source = component('<p>@(`Hola ${x} mundo ${y}`) @(`Solo`)</p>');
    const { value } = extract(source);

    expect(value.map((m) => [m.source, slice(source, m.span)])).toEqual([
      ['Hola', 'Hola '],
      ['mundo', ' mundo '],
      ['Solo', 'Solo'],
    ]);
  });

  it('a fixed part with a bad escape has no cooked text: it is skipped, the rest is not', () => {
    const source = component('<p>@(`Hola \\xZ ${b} mundo`)</p>');
    const { value, diagnostics } = extract(source);

    expect(value.map((m) => m.source)).toEqual(['mundo']);
    expect(diagnostics.map((d) => d.code)).toContain('FUD0170');
  });

  it('a literal without letters is not a message', () => {
    expect(sources(component('<p>@(ok ? "—" : "42")</p>'))).toEqual([]);
  });

  it('inside a translatable attribute', () => {
    expect(sources(component('<img alt=@(ok ? "Gato" : "Perro")>'))).toEqual(['Gato', 'Perro']);
  });

  it('not in control headers, render arguments or props', () => {
    const source = component(
      '@if (a === "Hola") { <b>@x</b> } @render row("Hola") <app-y .title=@(ok ? "Hola" : "Adiós")></app-y>',
    );

    expect(sources(source)).toEqual([]);
  });

  it('a phrase with a hole also gives the literals of the hole', () => {
    expect(sources(component('<p>Estado: @(ok ? "activo" : "parado")</p>'))).toEqual([
      'Estado: {arg1}',
      'activo',
      'parado',
    ]);
  });

  it('escapes and normalizes the literal', () => {
    expect(sources(component("<p>@(ok ? \"it's {x}\" : '  a   b ')</p>"))).toEqual(["it''s '{'x'}'", 'a b']);
  });
});

describe('t() (§4.3)', () => {
  it('a literal call in the view, a prop and @code', () => {
    const source = component(
      '<p>@t("Hola")</p><app-y .title=@t("Acerca de")></app-y>',
      "@code { import { t } from '@fudic/i18n'; const e = t('Error'); }\n",
    );
    const { value, diagnostics } = extract(source);

    expect(diagnostics).toEqual([]);
    expect(value.map((m) => [m.source, m.origin, slice(source, m.span), m.at])).toEqual([
      ['Error', 't', "t('Error')", 0],
      ['Hola', 't', 't("Hola")', 1],
      ['Acerca de', 't', 't("Acerca de")', 2],
    ]);
  });

  it('holes come from the ICU, with the expression of each key', () => {
    const source = component(
      '<p>@t("{n, plural, one {# de {who}} other {# de {who}}}", { n: count(), who: user.name, extra: 1 })</p>',
      IMPORT_T,
    );
    const m = only(source);

    expect(m.holes.map((h) => [h.name, slice(source, h.expr)])).toEqual([
      ['n', 'count()'],
      ['who', 'user.name'],
    ]);
  });

  it('follows a rename', () => {
    const source = component('<p>@tr("Hola")</p>', "@code { import { t as tr } from '@fudic/i18n'; }\n");
    expect(sources(source)).toEqual(['Hola']);
  });

  it('a t that is not imported from @fudic/i18n is not t', () => {
    const source = component('<p>@t(x)</p>', "@code { import { t } from 'i18next'; }\n");
    expect(extract(source)).toEqual({ value: [], diagnostics: [] });
  });

  it('nor a method called t, nor format()', () => {
    const source = component(
      '<p>@obj.t("Hola") @format(x, p) @other("Hola")</p>',
      "@code { import { t, format } from '@fudic/i18n'; }\n",
    );
    expect(extract(source)).toEqual({ value: [], diagnostics: [] });
  });

  it('criterion 8: t(variable) is FUD1020 on the argument; t() on the call', () => {
    const source = component('<p>@t(variable) @t()</p>', IMPORT_T);
    const { value, diagnostics } = extract(source);

    expect(value).toEqual([]);
    expect(diagnostics.map((d) => [d.code, d.severity, slice(source, d.span!)])).toEqual([
      ['FUD1020', 'error', 'variable'],
      ['FUD1020', 'error', 't()'],
    ]);
    expect(diagnostics[0]!.message).toContain('string literal');
  });

  it('a template literal is not a literal', () => {
    const source = component('<p>@t(`Hola`)</p>', IMPORT_T);
    expect(extract(source).diagnostics.map((d) => slice(source, d.span!))).toEqual(['`Hola`']);
  });

  it('criterion 8: holes without an object is FUD1020 on the message, and it is still a message', () => {
    const source = component('<p>@t("Hola {name}")</p>', IMPORT_T);
    const { value, diagnostics } = extract(source);

    expect(value.map((m) => [m.source, m.holes])).toEqual([['Hola {name}', []]]);
    expect(diagnostics.map((d) => [d.code, slice(source, d.span!)])).toEqual([['FUD1020', '"Hola {name}"']]);
    expect(diagnostics[0]!.message).toContain('missing `name`');
  });

  it('an object without a key is FUD1020 on the object, naming what is missing', () => {
    const source = component('<p>@t("{a} {b} {c}", { b: 1, ["a"]: 2, ...rest, "c": 3, 4: 5 })</p>', IMPORT_T);
    const { diagnostics } = extract(source);

    expect(diagnostics.map((d) => slice(source, d.span!))).toEqual(['{ b: 1, ["a"]: 2, ...rest, "c": 3, 4: 5 }']);
    expect(diagnostics[0]!.message).toContain('missing `a`');
    expect(diagnostics[0]!.message).not.toContain('`c`');
  });

  it('a second argument that is not an object literal does not name the holes', () => {
    const source = component('<p>@t("Hola {name}", args)</p>', IMPORT_T);
    expect(extract(source).diagnostics.map((d) => [d.code, slice(source, d.span!)])).toEqual([['FUD1020', 'args']]);
  });

  it('shorthand keys count', () => {
    expect(extract(component('<p>@t("Hola {name}", { name })</p>', IMPORT_T)).diagnostics).toEqual([]);
  });

  it('FUD1025: the same text with a different number of keys, on the second call', () => {
    const source = component(
      '<p>@t("Hola {name}", { name: a })</p>',
      "@code { import { t } from '@fudic/i18n';\n  const x = t('Hola {name}', { name: b });\n  const y = t('Hola {name}', { name: c, extra: 1 });\n}\n",
    );
    const { value, diagnostics } = extract(source);

    expect(diagnostics.map((d) => [d.code, d.severity, slice(source, d.span!)])).toEqual([
      ['FUD1025', 'error', "t('Hola {name}', { name: c, extra: 1 })"],
    ]);
    // Still one message: the same text in one context.
    expect(new Set(value.map((m) => m.key)).size).toBe(1);
    expect(value.map((m) => m.at)).toEqual([0, 0, 0]);
  });

  it('FUD1025 falls on the second in SOURCE order, even when @code is read after the view', () => {
    const source = component(
      '<p>@t("Hola {name}", { name: a })</p>',
      "@code { import { t } from '@fudic/i18n';\n  const y = t('Hola {name}', { name: c, extra: 1 });\n}\n",
    );

    expect(extract(source).diagnostics.map((d) => slice(source, d.span!))).toEqual(['t("Hola {name}", { name: a })']);
  });

  it('the same text with the same number of keys is no conflict, and a call with missing holes is never compared', () => {
    const source = component(
      '<p>@t("Hola {name}", { name: a }) @t("Hola {name}", { name: b }) @t("Hola {name}", { other: 1, more: 2 })</p>',
      IMPORT_T,
    );
    expect(extract(source).diagnostics.map((d) => d.code)).toEqual(['FUD1020']);
  });

  it('an invalid ICU message has no holes to ask for', () => {
    expect(extract(component('<p>@t("Hola {")</p>', IMPORT_T)).diagnostics).toEqual([]);
  });

  it('with only format imported, no call is looked at', () => {
    const source = component('<p>@t(x)</p>', "@code { import { format } from '@fudic/i18n'; }\n");
    expect(extract(source).diagnostics).toEqual([]);
  });
});

describe('ordinals and keys (§4.9)', () => {
  it('in source order, the same text twice sharing the first one\'s at', () => {
    const source = component('<p>Hola</p><img alt="Adiós"><p>Hola</p><p>@(ok ? "Hola" : "Fin")</p>');
    const { value } = extract(source);

    expect(value.map((m) => [m.source, m.origin, m.at])).toEqual([
      ['Hola', 'text', 0],
      ['Adiós', 'attribute', 1],
      ['Hola', 'text', 0],
      ['Hola', 'result', 0],
      ['Fin', 'result', 2],
    ]);
    expect(value.map((m) => m.key)).toEqual(value.map((m) => messageKey('app-x', m.source)));
  });
});

describe('criterion 9: never throws', () => {
  it('a broken .fud gives the messages of what parsed, and its diagnostics', () => {
    const source = component('<p>Hola <b>mundo</p><p>Adiós @(ok ? "sí" : )</p><p>Fin</p>');
    let result: ReturnType<typeof extractMessages> | undefined;
    expect(() => {
      result = extract(source);
    }).not.toThrow();

    expect(result!.diagnostics.length).toBeGreaterThan(0);
    expect(result!.diagnostics.map((d) => d.code)).toContain('FUD0170');
    expect(result!.value.map((m) => m.source)).toContain('Fin');
  });

  it.each(['', '<', '@', '@(', '@if (', '<app-x><template shadowrootmode="open"><p>@t(', '@code {', '<p title="'])(
    '%j',
    (source) => {
      expect(() => extract(source)).not.toThrow();
    },
  );
});

describe('contextOf (§4.9)', () => {
  const doc = (source: string): ReturnType<typeof structureDocument>['value'] =>
    structureDocument(source, parseDocument(source, { atConstructs }).value).value;

  it("a component's tag", () => {
    expect(contextOf('src/components/x.fud', doc(component('<p>x</p>')))).toBe('app-x');
  });

  it('anything else: the file without src/', () => {
    expect(contextOf('src/routes/about.fud', doc('<link rel="layout" href="./l.fud">\n<p>x</p>'))).toBe('routes/about.fud');
    expect(contextOf('src/lib/validation.ts')).toBe('lib/validation.ts');
    expect(contextOf('lib/src/x.ts')).toBe('lib/src/x.ts');
  });

  it('a component without a usable name falls back to the file', () => {
    expect(contextOf('src/components/x.fud', doc('<template shadowrootmode="open"><p>x</p></template>'))).toBe(
      'components/x.fud',
    );
  });
});

describe('extractScriptMessages (§4.3)', () => {
  it('criterion 8: t("Hola {name}", { name }) in a .ts is a message of origin t', () => {
    const source = "import { t } from '@fudic/i18n';\nexport const s = (name: string): string => t('Hola {name}', { name });\n";
    const { value, diagnostics } = extractScriptMessages(source, 'src/lib/greet.ts');

    expect(diagnostics).toEqual([]);
    expect(value).toHaveLength(1);
    const [m] = value;
    expect([m!.source, m!.origin, m!.context, m!.at, m!.tags]).toEqual(['Hola {name}', 't', 'lib/greet.ts', 0, 0]);
    expect(m!.key).toBe(messageKey('lib/greet.ts', 'Hola {name}'));
    expect(slice(source, m!.span)).toBe("t('Hola {name}', { name })");
    expect(m!.holes.map((h) => [h.name, slice(source, h.expr)])).toEqual([['name', 'name']]);
  });

  it('follows a rename and reports FUD1020 with spans in the module', () => {
    const source =
      "import { t as tr } from '@fudic/i18n';\nthrow new Error(tr('El nombre es obligatorio'));\ntr(v);\ntr('Hola {name}');\n";
    const { value, diagnostics } = extractScriptMessages(source, 'src/lib/validation.ts');

    expect(value.map((m) => [m.source, m.at])).toEqual([
      ['El nombre es obligatorio', 0],
      ['Hola {name}', 1],
    ]);
    expect(diagnostics.map((d) => [d.code, slice(source, d.span!)])).toEqual([
      ['FUD1020', 'v'],
      ['FUD1020', "'Hola {name}'"],
    ]);
  });

  it('reports FUD1025 among the calls of a module', () => {
    const source = "import { t } from '@fudic/i18n';\nt('{a}', { a });\nt('{a}', { a, b });\n";
    const { diagnostics } = extractScriptMessages(source, 'src/x.ts');

    expect(diagnostics.map((d) => [d.code, slice(source, d.span!)])).toEqual([['FUD1025', "t('{a}', { a, b })"]]);
  });

  it('a module that does not import t says nothing', () => {
    expect(extractScriptMessages("const t = (s: string) => s;\nt('Hola');\n", 'src/x.ts')).toEqual({
      value: [],
      diagnostics: [],
    });
  });

  it('parses .js, .mjs and .cjs as JavaScript and anything else as TypeScript', () => {
    const typed = 'const x: number = 1;\n';
    expect(extractScriptMessages(typed, 'src/a.ts').diagnostics).toEqual([]);
    for (const file of ['src/a.js', 'src/a.mjs', 'src/a.cjs']) {
      expect(extractScriptMessages(typed, file).diagnostics.map((d) => d.code)).toContain('FUD0170');
    }
    expect(extractScriptMessages("import { t } from '@fudic/i18n';\nt('Hola');\n", 'src/a.js').value).toHaveLength(1);
  });

  it('a syntax error is FUD0170 and never a throw', () => {
    const source = 'const x = ;\n';
    const { diagnostics } = extractScriptMessages(source, 'src/a.ts');

    expect(diagnostics.map((d) => [d.code, slice(source, d.span!)])).toEqual([['FUD0170', ';']]);
  });
});
