/**
 * `collectMessages` beyond the list: the maps the emit of a language's module will look its
 * messages up in (§4.2 "Al compilar"), and `holeName`/`isInline` on their own.
 */

import { parseSync } from 'oxc-parser';
import { describe, expect, it } from 'vitest';
import { atConstructs } from '../../src/constructs.js';
import { structureDocument } from '../../src/document/index.js';
import { parseDocument, type ElementNode, type HtmlContent } from '../../src/html/index.js';
import { i18nImports } from '../../src/i18n/ast.js';
import { batchOf } from '../../src/i18n/extract.js';
import { collectMessages, holeName, isInline, type ViewMessages } from '../../src/i18n/index.js';
import type { OxcNode } from '../../src/oxc/index.js';
import { documentRoots } from '../../src/semantic/index.js';

const component = (body: string, code = ''): string =>
  `${code}<app-x><template shadowrootmode="open">${body}</template></app-x>`;

function collect(source: string): ViewMessages {
  const document = structureDocument(source, parseDocument(source, { atConstructs }).value).value;
  const js = batchOf(source, document);
  return collectMessages({
    source,
    context: 'ctx',
    roots: documentRoots(document),
    astAt: js.astAt,
    scripts: js.scripts,
    imports: i18nImports(js.code),
    mapSpan: js.mapSpan,
  });
}

function expr(code: string): OxcNode {
  const [stmt] = parseSync('x.ts', code, { sourceType: 'module', lang: 'ts' }).program.body as unknown as OxcNode[];
  return stmt!['expression'] as OxcNode;
}

function elementOf(html: string): ElementNode {
  return parseDocument(html, { atConstructs }).value.children[0] as ElementNode;
}

describe('the phrases map', () => {
  it('every item of the run finds its phrase, with its holes and tags', () => {
    const source = component('<p>Hola <b class="x">@user.name</b>, tienes @count() mensajes</p>');
    const { phrases, messages } = collect(source);
    const items = [...phrases.keys()];
    const phrase = phrases.get(items[0]!)!;

    expect(messages).toHaveLength(1);
    expect(phrase.message).toBe(messages[0]);
    expect(items.map((i) => phrases.get(i))).toEqual(items.map(() => phrase));
    expect(phrase.items.map((i) => i.type)).toEqual(['text', 'element', 'text', 'razor-expression', 'text']);
    expect([...phrase.tagOf].map(([el, n]) => [el.name, n])).toEqual([['b', 0]]);
    expect([...phrase.holeOf.values()]).toEqual(['name', 'count']);
  });

  it('a repeated expression is one hole, mapped from both places', () => {
    const { phrases } = collect(component('<p>De @a a @a</p>'));
    const [phrase] = new Set(phrases.values());

    expect(phrase!.message.source).toBe('De {a} a {a}');
    expect(phrase!.message.holes.map((h) => h.name)).toEqual(['a']);
    expect([...phrase!.holeOf.values()]).toEqual(['a', 'a']);
  });
});

describe('the attributes map', () => {
  it('a translatable attribute finds its message and its holes', () => {
    const { attributes } = collect(component('<img alt="Foto de @name" class="x">'));
    const [attr, entry] = [...attributes][0]!;

    expect(attr.name).toBe('alt');
    expect(entry.message.source).toBe('Foto de {name}');
    expect([...entry.holeOf.values()]).toEqual(['name']);
  });
});

describe('the literals map', () => {
  it('a literal finds its message, its node and its content in .fud coordinates', () => {
    const source = component('<p>@(ok ? "sí" : `no ${x}`)</p>');
    const { literals } = collect(source);
    const entries = [...literals.values()];

    expect(entries.map((e) => [e.message.source, e.node.type, source.slice(e.content.start, e.content.end)])).toEqual([
      ['sí', 'Literal', 'sí'],
      ['no', 'TemplateElement', 'no '],
    ]);
    expect([...literals.keys()]).toEqual(entries.map((e) => e.node));
  });
});

describe('the calls map', () => {
  it('a t() call finds its message', () => {
    const source = component('<p>@t("Hola")</p>', "@code { import { t } from '@fudic/i18n'; }\n");
    const { calls } = collect(source);
    const [call, entry] = [...calls][0]!;

    expect(entry.call).toBe(call);
    expect(call.type).toBe('CallExpression');
    expect(entry.message.origin).toBe('t');
  });
});

describe('holeName', () => {
  it.each([
    ['a', 'a'],
    ['a.b.c', 'c'],
    ['a?.b', 'b'],
    ['count()', 'count'],
    ['user.name()', 'name'],
    ['(x as number)', 'x'],
    ['price | euros', 'price'],
    ['a.b | c', 'b'],
  ])('%s → %s', (code, name) => {
    expect(holeName(expr(code))).toBe(name);
  });

  it.each(['a[0]', 'a["b"]', 'f(1)', '(a || b)()', 'a + b', 'a ? b : c', '1', '"x"', '`x`'])('%s has no name', (code) => {
    expect(holeName(expr(code))).toBeUndefined();
  });
});

describe('isInline', () => {
  const first = (html: string): HtmlContent => parseDocument(html, { atConstructs }).value.children[0]!;

  it('text, @expr and @@ are inline', () => {
    expect(isInline(first('Hola'))).toBe(true);
    expect(isInline(first('@x'))).toBe(true);
    expect(isInline(first('@@'))).toBe(true);
  });

  it('a phrasing element of inline content is; a block, a component or translate="no" is not', () => {
    expect(isInline(elementOf('<B>x <i>y</i></B>'))).toBe(true);
    expect(isInline(elementOf('<span><div>x</div></span>'))).toBe(false);
    expect(isInline(elementOf('<div>x</div>'))).toBe(false);
    expect(isInline(elementOf('<app-y>x</app-y>'))).toBe(false);
    expect(isInline(elementOf('<code translate="no">x</code>'))).toBe(false);
  });

  it('a comment or a construct is not', () => {
    expect(isInline(first('<!-- x -->'))).toBe(false);
    expect(isInline(first('@if (a) { x }'))).toBe(false);
  });
});
