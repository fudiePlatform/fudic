/**
 * SDD-70 decisions 168, 169 — `@await <expr> { … } @catch (e) { … }` in the structure of the
 * document (§3.2, criterion 7, §8.2.4).
 *
 * The parser hangs the `@catch` off the `@await` it follows, like `@empty` off a loop; a stray or
 * second one is `FUD1323` and the parse goes on. Every walk of the compiler that descends a
 * construct descends both blocks of an `@await` (§8.2.4: it is not a `ControlNode`, so each walk
 * names it).
 */

import { describe, expect, it } from 'vitest';
import { parseDocument, type ElementNode, type HtmlContent } from '../../src/html/index.js';
import { atConstructs } from '../../src/constructs.js';
import type { AwaitNode } from '../../src/control/index.js';
import { structureDocument } from '../../src/document/index.js';
import { documentRoots, walk } from '../../src/semantic/index.js';
import { walkBlocks } from '../../src/binding/markers.js';
import { collectDirectives } from '../../src/layout/collect.js';
import { regionAt } from '../../src/region/index.js';
import { batchOf } from '../../src/i18n/extract.js';
import { collectMessages } from '../../src/i18n/index.js';
import { i18nImports } from '../../src/i18n/ast.js';
import { awaitBranches, blocksOf, collectTemplateJs, refTargets } from '../../src/emit/constructs.js';
import { hydratableTags, resolveComponents } from '../../src/emit/index.js';
import { hasHookupIn, walkElements } from '../../src/emit/level.js';
import { expandDocument } from '../../src/expand/index.js';
import type { ResolveIo } from '../../src/types/index.js';
import { memoryIo } from '../emit/_support.js';
import { viewDiagnostics } from '../semantic/_view.js';

function parse(source: string): { readonly nodes: readonly HtmlContent[]; readonly codes: readonly string[] } {
  const result = parseDocument(source, { atConstructs });
  return {
    nodes: result.value.children,
    codes: result.diagnostics.map((d) => `${d.code} ${source.slice(d.span.start, d.span.end)}`),
  };
}

const slice = (source: string, at: { readonly start: number; readonly end: number }): string => source.slice(at.start, at.end);

const component = (inner: string): string => `<x-a><template shadowrootmode="open">${inner}</template></x-a>`;

function roots(inner: string): readonly HtmlContent[] {
  const source = component(inner);
  return documentRoots(structureDocument(source, parseDocument(source, { atConstructs }).value).value);
}

describe('the parser reads `@await` and hangs its `@catch` off it', () => {
  it('a body and a catch, the catch covered by the `@await` (criterion 3)', () => {
    const source = '@await data.users { <p>a</p> } @* failed *@ @catch (e) { <p>@e.status</p> }<i>after</i>';
    const { nodes, codes } = parse(source);
    expect(codes).toEqual([]);
    const node = nodes[0] as unknown as AwaitNode;
    expect(node.type).toBe('await');
    expect(slice(source, node.expression)).toBe('data.users');
    expect(node.body.some((n) => n.type === 'element')).toBe(true);
    expect(node.catch?.type).toBe('catch-block');
    expect(slice(source, node.catch!.span)).toBe('@catch (e) { <p>@e.status</p> }');
    expect(slice(source, node.catch!.header.inner)).toBe('e');
    expect(slice(source, node.span)).toBe(source.slice(0, source.indexOf('<i>')));
    expect(nodes.at(-1)!.type).toBe('element');
  });

  it('one without a catch ends at its `}`, and a bare `catch` after it is text', () => {
    const source = '@await data.users { <p>a</p> } catch';
    const { nodes, codes } = parse(source);
    expect(codes).toEqual([]);
    const node = nodes[0] as unknown as AwaitNode;
    expect(node.catch).toBeUndefined();
    expect(slice(source, node.span)).toBe('@await data.users { <p>a</p> }');
  });

  it('a name that only starts with `catch` after the `}` is not a catch', () => {
    const source = '@await data.users { <p>a</p> } <p>@catchy</p>';
    const { nodes, codes } = parse(source);
    expect(codes).toEqual([]);
    expect((nodes[0] as unknown as AwaitNode).catch).toBeUndefined();
  });

  it('what is awaited runs to the `{`, over parentheses, brackets and quotes that hold one', () => {
    for (const expression of ['fetchX("{", a[0], `{${b}`)', "list['{']", 'data . users', "'{' + x", '"}" + y', '`{${z}`']) {
      const source = `@await ${expression} { <p>a</p> }`;
      const { nodes, codes } = parse(source);
      expect(codes).toEqual([]);
      expect(slice(source, (nodes[0] as unknown as AwaitNode).expression)).toBe(expression);
    }
  });

  it('with no `{`, it keeps the expression, says FUD0071 and gives the rest back as content', () => {
    for (const [source, expression] of [
      ['@await data.users <p>b</p>', 'data.users'],
      ['<div>@await data.users</div>', 'data.users'],
      ['@await data.users @if (a) { <p>b</p> }', 'data.users'],
      ['@await data.users', 'data.users'],
    ] as const) {
      const { nodes, codes } = parse(source);
      const node = nodes.flatMap((n) => (n.type === 'element' ? (n as ElementNode).children : [n]))[0] as unknown as AwaitNode;
      expect(node.type).toBe('await');
      expect(slice(source, node.expression)).toBe(expression);
      expect(node.body).toEqual([]);
      expect(codes).toEqual(['FUD0071 ']);
    }
  });

  it('with nothing written, the expression is empty at the `{`', () => {
    const source = '@await { <p>a</p> }';
    const { nodes } = parse(source);
    const node = nodes[0] as unknown as AwaitNode;
    expect(node.expression.start).toBe(node.expression.end);
    expect(node.body.some((n) => n.type === 'element')).toBe(true);
  });

  it('a catch with no `(` is FUD0070, and its body is still read', () => {
    const source = '@await data.users { } @catch { <p>x</p> }';
    const { nodes, codes } = parse(source);
    const node = nodes[0] as unknown as AwaitNode;
    expect(codes).toEqual(['FUD0070 ']);
    expect(node.catch?.body.some((n) => n.type === 'element')).toBe(true);
    expect(node.catch?.header.closed).toBe(false);
  });

  it('a catch with no body is FUD0071, and degrades to its header', () => {
    const source = '@await data.users { } @catch (e) <p>b</p>';
    const { nodes, codes } = parse(source);
    const node = nodes[0] as unknown as AwaitNode;
    expect(codes).toEqual(['FUD0071 ']);
    expect(node.catch?.body).toEqual([]);
    expect(slice(source, node.catch!.span)).toBe('@catch (e)');
    expect(nodes.at(-1)!.type).toBe('element');
  });
});

describe('a misplaced `@catch` is FUD1323, and the parse goes on (criterion 7)', () => {
  it('on its own, after an `@if`, and a second one', () => {
    expect(parse('<p>@catch</p>').codes).toEqual(['FUD1323 @catch']);
    expect(parse('@if (a) { <p>a</p> } @catch (e) { <p>b</p> }').codes).toEqual(['FUD1323 @catch']);
    expect(parse('@await data.users { } @catch (e) { } @catch (f) { <p>b</p> }').codes).toEqual(['FUD1323 @catch']);
  });

  it('after an `@await` that never got its body', () => {
    expect(parse('@await data.users @catch (e) { <p>b</p> }').codes).toEqual(['FUD0071 ', 'FUD1323 @catch']);
  });

  it('what follows is still parsed, and its own diagnostics still reported', () => {
    // The stray `@catch` consumes only its keyword: `(e)` and the block are content, and the
    // `@if` after them still says its own FUD0070.
    const { nodes, codes } = parse('<p>@catch (e) { x }</p> @if { <i>y</i> }');
    expect(codes).toEqual(['FUD1323 @catch', 'FUD0070 ']);
    expect(nodes.some((n) => n.type === 'if')).toBe(true);
  });

  it('through the whole pass: a stray `@catch` beside a view error reports both', () => {
    const source = component('<p>@catch</p><p>@({ a: 1 })</p>');
    expect(parse(source).codes).toEqual(['FUD1323 @catch']);
    expect(viewDiagnostics(source).map((d) => d.code)).toContain('FUD0195');
  });
});

const AWAIT = '@await data.users { <p>a</p> } @catch (e) { <b>none</b> }';

describe('the walks descend into both blocks of an `@await` (§8.2.4)', () => {
  it('the semantic walk: its own callback, then two blocks of their own', () => {
    const seen: string[] = [];
    walk(roots(AWAIT), {
      awaitBlock: (node) => void seen.push(`await ${node.catch === undefined ? 'bare' : 'caught'}`),
      enterBlock: (owner) => void seen.push(`enter ${owner.type}`),
      element: (el) => {
        if (el.name === 'p' || el.name === 'b') seen.push(el.name);
      },
    });
    expect(seen).toEqual(['await caught', 'enter await', 'p', 'enter catch-block', 'b']);
  });

  it('the semantic walk of an `@await` with no catch', () => {
    const seen: string[] = [];
    walk(roots('@await data.users { <p>a</p> }'), { enterBlock: (owner) => void seen.push(owner.type) });
    expect(seen).toEqual(['await']);
  });

  it('the blocks of the hydration markers', () => {
    const seen: string[] = [];
    walkBlocks(roots(`@foreach (const x of xs) key (x) { ${AWAIT} } @await data.stats { <i>s</i> }`), (el, _block, inLoop) => {
      if (['p', 'b', 'i'].includes(el.name)) seen.push(`${el.name} ${inLoop}`);
    });
    expect(seen).toEqual(['p true', 'b true', 'i false']);
  });

  it('the layout directives, in the body and in the catch', () => {
    expect(collectDirectives(parse('@await data.users { @RenderBody() } @catch (e) { @RenderBody() }').nodes).renderBody).toHaveLength(2);
    expect(collectDirectives(parse('@await data.users { @RenderBody() }').nodes).renderBody).toHaveLength(1);
  });

  it('the region under the caret: what is awaited is an expression, the blocks are markup', () => {
    const source = '@await data.users { <p>alpha</p> } @catch (e) { <b>beta</b> }';
    const document = parseDocument(source, { atConstructs }).value;
    expect(regionAt(source, document, source.indexOf('users') + 2)).toEqual({
      kind: 'expression',
      span: { start: source.indexOf('data'), end: source.indexOf('users') + 5 },
    });
    // End included, where the caret spends its life.
    expect(regionAt(source, document, source.indexOf('users') + 5).kind).toBe('expression');
    expect(regionAt(source, document, source.indexOf('alpha') + 1).kind).toBe('markup');
    expect(regionAt(source, document, source.indexOf('beta') + 1).kind).toBe('markup');
    const bare = '@await data.users { <p>alpha</p> }';
    expect(regionAt(bare, parseDocument(bare, { atConstructs }).value, bare.indexOf('{')).kind).toBe('markup');
  });

  it('the messages to translate, in the body and in the catch', () => {
    const source = `@code { import { t } from '@fudic/i18n'; }\n${component(AWAIT)}`;
    const document = structureDocument(source, parseDocument(source, { atConstructs }).value).value;
    const js = batchOf(source, document);
    const collect = (src: string, doc: typeof document) =>
      collectMessages({
        source: src,
        context: 'ctx',
        roots: documentRoots(doc),
        astAt: js.astAt,
        scripts: js.scripts,
        imports: i18nImports(js.code),
        mapSpan: js.mapSpan,
      }).messages.map((m) => m.source);
    expect(collect(source, document)).toEqual(['a', 'none']);
    const bare = `@code { import { t } from '@fudic/i18n'; }\n${component('@await data.users { <p>alone</p> }')}`;
    const bareDoc = structureDocument(bare, parseDocument(bare, { atConstructs }).value).value;
    expect(collect(bare, bareDoc)).toEqual(['alone']);
  });

  it('`@raw` misused in either block is FUD0990', () => {
    const codes = (inner: string) =>
      viewDiagnostics(component(inner))
        .filter((d) => d.code === 'FUD0990')
        .map((d) => component(inner).slice(d.span.start, d.span.end));
    expect(codes('@await data.users { @raw(h) } @catch (e) { <p>@raw(h) x</p> }')).toEqual(['@raw(h)', '@raw(h)']);
    expect(codes('@await data.users { <p>@raw(h)</p> }')).toEqual([]);
  });

  it('the name of the catch is declared in its block, and only there', () => {
    const unknown = (inner: string) =>
      viewDiagnostics(component(inner))
        .filter((d) => d.code === 'FUD0907')
        .map((d) => component(inner).slice(d.span.start, d.span.end));
    expect(unknown('@await data.users { } @catch (e) { <p>@e.status</p> }')).toEqual([]);
    expect(unknown('@await data.users { <p>@e.status</p> } @catch (e) { }')).toEqual(['e']);
  });
});

describe('the emit walks descend into both blocks too', () => {
  it('the branches of an `@await`: the body, and the catch when written', () => {
    const [caught] = parse(AWAIT).nodes as unknown as AwaitNode[];
    expect(awaitBranches(caught!).map((b) => b.kind)).toEqual(['await', 'catch']);
    const [bare] = parse('@await data.users { <p>a</p> }').nodes as unknown as AwaitNode[];
    expect(awaitBranches(bare!).map((b) => b.kind)).toEqual(['await']);
    expect(blocksOf(parse(AWAIT).nodes[0]!)).toHaveLength(2);
    expect(blocksOf(parse('<p>x</p>').nodes[0]!)).toEqual([]);
  });

  it('the elements of a template, and the hookup among them', () => {
    const source = '@await data.users { <p>a</p> } @catch (e) { <button @click="@go">b</button> }';
    const names: string[] = [];
    walkElements(parse(source).nodes, (el) => names.push(el.name));
    expect(names).toEqual(['p', 'button']);
    expect(hasHookupIn(source, parse(source).nodes)).toBe(true);
  });

  it('the refs of a template', () => {
    const source = '@await data.users { <p ref="@a">x</p> } @catch (e) { <i ref="@b">y</i> }';
    expect([...refTargets(parse(source).nodes, source)].sort()).toEqual(['a', 'b']);
  });

  it('the JS the template evaluates: nothing for what is awaited, every fragment of both blocks', () => {
    const source = '@await data.users { <p>@a</p> } @catch (e) { <p>@b</p> }';
    const read: string[] = [];
    collectTemplateJs(parse(source).nodes, (_kind, at) => read.push(source.slice(at.start, at.end)));
    expect(read).toEqual(['a', 'b']);
  });

  it('a host inside an `@await` of a component that hydrates hydrates: the browser may create it', () => {
    const tpl = (tag: string, code: string, markup: string): string =>
      `${code}\n<${tag}>\n  <template shadowrootmode="open">\n${markup}\n  </template>\n</${tag}>\n`;
    const graph = resolveComponents(
      '/app/home.fud',
      memoryIo({
        '/app/home.fud': '<!DOCTYPE html>\n<html>\n  <head>\n    <link rel="component" href="./x-parent.fud">\n  </head>\n  <body><x-parent></x-parent></body>\n</html>\n',
        '/app/x-parent.fud':
          '<link rel="component" href="./x-badge.fud">\n' +
          tpl('x-parent', "@code {\n  import { signal } from '@fudic/core';\n  const n = signal(0);\n}", '<p>@(n())</p>@await data.users { } @catch (e) { <x-badge .tone="success"></x-badge> }'),
        '/app/x-badge.fud': tpl('x-badge', "@code {\n  const { tone = 'neutral' } = props<{ tone?: string }>();\n}", '<span>@tone</span>'),
      }),
    );
    expect([...hydratableTags(graph)].sort()).toEqual(['x-badge', 'x-parent']);
  });

  it('a `@render` inside an `@await` is expanded', () => {
    const files: Record<string, string> = {
      '/app/page.fud': `@snippet card(title: string) { <article>@title</article> }\n${component('@await data.users { @render card("A") } @catch (e) { @render card("B") }')}`,
    };
    const io: ResolveIo = { read: (path) => files[path]!, resolve: (_from, href) => href };
    const source = files['/app/page.fud']!;
    const document = structureDocument(source, parseDocument(source, { atConstructs }).value).value;
    const expanded = expandDocument('/app/page.fud', source, document, io).source;
    expect(expanded).toContain('<article>@("A")</article>');
    expect(expanded).toContain('<article>@("B")</article>');
    expect(expanded).not.toContain('@render');
  });
});
