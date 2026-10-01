/**
 * SDD-49 §6, criteria 10–14 — what a selector could match in each scope of a page
 * (`src/emit/surface.ts`).
 *
 * Every graph is resolved for real from sources held in memory: the surface is read off the
 * same trees the emit walks, so a test that hand-built them would prove nothing.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resolveDocument, type DocumentGraph } from '../../src/emit/index.js';
import {
  documentSurface,
  frameworkAttributesOf,
  pageTokenConsumers,
  shadowSurface,
  unionSurfaces,
  type ScopeSurface,
} from '../../src/emit/surface.js';
import type { ElementNode } from '../../src/html/index.js';
import { memoryIo, parse } from './_support.js';

/** Resolve `entry` against an in-memory set of files. */
function graphOf(entry: string, files: Record<string, string>): DocumentGraph {
  return resolveDocument(entry, memoryIo(files)).value;
}

/** A component file: optional `<style>`, its tag, its template body. */
function component(tag: string, template: string, opts: { style?: string; links?: string; tail?: string } = {}): string {
  return (
    (opts.links ?? '') +
    (opts.style === undefined ? '' : `<head>\n  <style>${opts.style}</style>\n</head>\n`) +
    `<${tag}>\n  <template shadowrootmode="open">\n${template}\n  </template>\n</${tag}>\n` +
    (opts.tail ?? '')
  );
}

const sorted = (s: ReadonlySet<string>): string[] => [...s].sort();

/** The first element named `name` in a `.fud` parsed on its own. */
function elementOf(source: string, name: string): ElementNode {
  const doc = parse(source);
  const roots = 'body' in doc ? doc.body.children : 'markup' in doc ? doc.markup : [];
  const found = find(roots as readonly { type: string }[], name);
  if (found === undefined) throw new Error(`no <${name}>`);
  return found;
}

function find(nodes: readonly { type: string }[], name: string): ElementNode | undefined {
  for (const n of nodes) {
    if (n.type !== 'element') continue;
    const el = n as ElementNode;
    if (el.name === name) return el;
    const inner = find(el.children as readonly { type: string }[], name);
    if (inner !== undefined) return inner;
  }
  return undefined;
}

/** A page whose body is `body`, and the element named `name` in it. */
const pageElement = (body: string, name: string): ElementNode =>
  elementOf(`<!DOCTYPE html>\n<html><head></head><body>${body}</body></html>`, name);

// ---------------------------------------------------------------------------

describe('documentSurface (criterion 10)', () => {
  const files: Record<string, string> = {
    '/app/_layout.fud':
      '<!DOCTYPE html>\n<html lang="es">\n<head>\n<link rel="component" href="./x-card.fud">\n@RenderHead()\n</head>\n' +
      '<body data-theme="dark">\n<header class="site">h</header>\n<main>@RenderBody()</main>\n' +
      '<aside>@RenderSection(aside)</aside>\n</body>\n</html>\n',
    '/app/index.fud':
      '<link rel="layout" href="./_layout.fud">\n<link rel="component" href="./x-card.fud">\n' +
      '<section class="route">\n  <x-card variant="big"><p class="projected">x</p></x-card>\n</section>\n' +
      '@section aside {\n  <nav id="side">n</nav>\n}\n',
    '/app/x-card.fud': component('x-card', '    <h1 class="title">t</h1><slot></slot>'),
  };
  const s = documentSurface(graphOf('/app/index.fud', files));

  it('holds the shell, the layout’s body, the route, its sections, hosts and what they project', () => {
    expect(sorted(s.tags)).toEqual(['aside', 'body', 'header', 'html', 'main', 'nav', 'p', 'section', 'x-card']);
    expect(sorted(s.classes)).toEqual(['projected', 'route', 'site']);
    expect(sorted(s.ids)).toEqual(['side']);
    expect(s.attributes.get('lang')).toEqual(new Set(['es']));
    expect(s.attributes.get('data-theme')).toEqual(new Set(['dark']));
    expect(s.attributes.get('variant')).toEqual(new Set(['big']));
    // What the framework writes on a custom element counts as written.
    expect(s.attributes.get('data-fud-adopt')).toBeNull();
    expect(s.slotted).toBeNull();
  });

  it('does NOT hold what lives only in a component’s template', () => {
    expect(s.tags.has('h1')).toBe(false);
    expect(s.classes.has('title')).toBe(false);
    expect(s.tags.has('slot')).toBe(false);
  });

  it('a page without a layout', () => {
    const page = documentSurface(
      graphOf('/p.fud', {
        '/p.fud': '<!DOCTYPE html>\n<html lang="en"><head></head><body class="b"><article>a</article></body></html>',
      }),
    );
    expect(sorted(page.tags)).toEqual(['article', 'body', 'html']);
    expect(sorted(page.classes)).toEqual(['b']);
  });

  it('a layout compiled as its own entry', () => {
    const layout = documentSurface(graphOf('/app/_layout.fud', files));
    expect(layout.tags.has('header')).toBe(true);
    expect(layout.tags.has('section')).toBe(false);
  });

  it('a component entry: only `html` and `body`', () => {
    const comp = documentSurface(graphOf('/app/x-card.fud', files));
    expect(sorted(comp.tags)).toEqual(['body', 'html']);
    expect(comp.attributes.size).toBe(0);
  });

  it('a hole a slot seals: the roots the route writes there carry `slot`, through a construct', () => {
    const sealed = documentSurface(
      graphOf('/app/index.fud', {
        '/app/_layout.fud':
          '<!DOCTYPE html>\n<html><head>\n<link rel="component" href="./x-frame.fud">\n@RenderHead()\n</head>\n' +
          '<body><x-frame>@RenderBody(slot: "main")\n@RenderSection(aside, slot: "side")</x-frame></body>\n</html>\n',
        '/app/index.fud':
          '<link rel="layout" href="./_layout.fud">\n' +
          '@if (data.on) {\n  <p>a</p>\n} else {\n  <div>b</div>\n}\ntext\n' +
          '@section aside {\n  <nav>n</nav>\n}\n',
        '/app/x-frame.fud': component('x-frame', '<slot name="main"></slot><slot name="side"></slot>'),
      }),
    );
    expect(sorted(sealed.tags)).toEqual(['body', 'div', 'html', 'nav', 'p', 'x-frame']);
    expect(sealed.attributes.get('slot')).toBeNull();
  });

  it('a hole with no slot leaves `slot` out', () => {
    expect(s.attributes.has('slot')).toBe(false);
  });
});

describe('shadowSurface (criterion 11)', () => {
  const files: Record<string, string> = {
    '/app/index.fud':
      '<link rel="layout" href="./_layout.fud">\n<link rel="component" href="./x-list.fud">\n' +
      '<x-list><li class="top">a</li>text<em>b</em></x-list>\n' +
      '@if (data.x) {\n  <x-list><ol class="branch">c</ol></x-list>\n}\n',
    '/app/_layout.fud':
      '<!DOCTYPE html>\n<html><head>\n@RenderHead()\n</head>\n<body>@RenderBody()</body>\n</html>\n',
    '/app/x-list.fud': component(
      'x-list',
      '    <ul part="items">\n' +
        '      @if (false) {\n        <li class="yes">y</li>\n      } else {\n        <li class="no">n</li>\n      }\n' +
        '      @switch (data.k) { case 1: <b>1</b> default: <i>d</i> }\n' +
        '      @foreach (const r of rows) key (r) {\n        @render row(r)\n      }\n' +
        '    </ul>\n    <x-item tone="info"><span class="inner">s</span></x-item>\n    <slot></slot>',
      {
        links: '<link rel="component" href="./x-item.fud">\n',
        tail: '@snippet row(label: string) {\n  <li class="row">@label</li>\n}\n',
      },
    ),
    '/app/x-item.fud': component('x-item', '    <label part="@data.p">l</label><slot></slot>'),
  };
  const graph = graphOf('/app/index.fud', files);
  const s = shadowSurface(graph, 'x-list');

  it('holds the template in every branch, its snippets expanded, and the hosts it uses', () => {
    expect(sorted(s.tags)).toEqual(['b', 'i', 'li', 'slot', 'span', 'ul', 'x-item']);
    expect(sorted(s.classes)).toEqual(['inner', 'no', 'row', 'yes']);
    expect(s.attributes.get('tone')).toEqual(new Set(['info']));
  });

  it('`slotted` is what the page projects into the host, wherever it is written', () => {
    expect(sorted(s.slotted!.tags)).toEqual(['em', 'li', 'ol']);
    expect(sorted(s.slotted!.classes)).toEqual(['branch', 'top']);
    expect(s.slotted!.slotted).toBeNull();
    expect(s.slotted!.parts).toBe('any');
  });

  it('`slotted` of a nested host reads the template that writes it', () => {
    const inner = shadowSurface(graph, 'x-item');
    expect(sorted(inner.tags)).toEqual(['label', 'slot']);
    expect(sorted(inner.slotted!.tags)).toEqual(['span']);
  });

  it('`parts`: literal ones, or `any` when one is an expression', () => {
    expect(s.parts).toBe('any');
    const literal = shadowSurface(
      graphOf('/c.fud', {
        '/c.fud': component('x-c', '<p part="a b">x</p><p title="t">y</p>'),
      }),
      'x-c',
    );
    expect(literal.parts).toEqual(new Set(['a', 'b']));
  });

  it('a tag that is not in the graph has an empty surface', () => {
    const none = shadowSurface(graph, 'x-none');
    expect(none.tags.size).toBe(0);
    expect(none.slotted!.tags.size).toBe(0);
  });

  it('a degraded component, with no template, adds nothing', () => {
    const g = graphOf('/c.fud', { '/c.fud': '<x-bare><p>no template</p></x-bare>\n' });
    expect(shadowSurface(g, 'x-bare').tags.size).toBe(0);
    expect(documentSurface(g).parts).toEqual(new Set());
  });
});

describe('what an element contributes (criterion 12)', () => {
  const graph = graphOf('/c.fud', {
    '/c.fud': component(
      'x-c',
      '<p class:activo=@x class="a @b" id=@i type=@t data-k="v" .value=@v @click=@go bus:(ch)=@h bus:save=@s ' +
        'style:color=@c title="  " aria-x="1 @y">x</p>' +
        '<p id="lit" type="text" class="  c  d ">y</p><p id="  ">z</p>',
      { tail: '' },
    ),
  });
  const s = shadowSurface(graph, 'x-c');

  it('`class:` names its class; an interpolated `class` opens the space', () => {
    expect(sorted(s.classes)).toEqual(['a', 'activo', 'c', 'd']);
    expect(s.openClasses).toBe(true);
    expect(s.attributes.get('class')).toBeNull();
  });

  it('an interpolated `id` opens the ids; a literal one is kept trimmed, a blank one is not', () => {
    expect(s.openIds).toBe(true);
    expect(sorted(s.ids)).toEqual(['lit']);
  });

  it('an attribute from an expression has `null` values, whatever was seen before or after', () => {
    expect(s.attributes.get('type')).toBeNull();
    expect(s.attributes.get('aria-x')).toBeNull();
    expect(s.attributes.get('data-k')).toEqual(new Set(['v']));
    expect(s.attributes.get('title')).toEqual(new Set(['  ']));
  });

  it('properties, events and bus channels are not attributes; `style:` is `style`', () => {
    expect([...s.attributes.keys()].some((k) => k.startsWith('.') || k.startsWith('@') || k.startsWith('bus:'))).toBe(
      false,
    );
    expect(s.attributes.has('value')).toBe(false);
    expect(s.attributes.get('style')).toBeNull();
  });

  it('a static and an interpolated `id` on one scope, in either order', () => {
    const first = shadowSurface(graphOf('/d.fud', { '/d.fud': component('x-d', '<p id=@i>a</p><p id="b">b</p>') }), 'x-d');
    expect(first.attributes.get('id')).toBeNull();
    expect(sorted(first.ids)).toEqual(['b']);
  });
});

describe('frameworkAttributesOf (criterion 13)', () => {
  it('a bound control: its marker, and what `@fudic/forms` writes; a bound `<form>` too', () => {
    expect(frameworkAttributesOf(pageElement('<input control="email">', 'input'))).toEqual([
      'aria-describedby',
      'aria-invalid',
      'aria-label',
      'data-fud-space',
    ]);
    expect(frameworkAttributesOf(pageElement('<form control="f"></form>', 'form'))).toEqual([
      'aria-describedby',
      'aria-invalid',
      'aria-label',
      'novalidate',
      'data-fud-space',
    ]);
  });

  it('a field with no `control`: what a relay may label', () => {
    for (const tag of ['input', 'select', 'textarea', 'fieldset']) {
      const html = tag === 'input' ? '<input>' : `<${tag}></${tag}>`;
      expect(frameworkAttributesOf(pageElement(html, tag))).toEqual(['aria-invalid', 'aria-label', 'data-fud-space']);
    }
  });

  it('an `error` or `summary` marker', () => {
    const expected = ['id', 'aria-live', 'tabindex', 'data-fud-space'];
    expect(frameworkAttributesOf(pageElement('<p error="email"></p>', 'p'))).toEqual(expected);
    expect(frameworkAttributesOf(pageElement('<div summary></div>', 'div'))).toEqual(expected);
  });

  it('a custom element: the adoption and hydration markers', () => {
    expect(frameworkAttributesOf(pageElement('<x-a></x-a>', 'x-a'))).toEqual([
      'data-fud-adopt',
      'data-fud-id',
      'data-fud-space',
    ]);
  });

  it('a root a slotted hole seals carries `slot`', () => {
    expect(frameworkAttributesOf(pageElement('<p></p>', 'p'), true)).toEqual(['slot', 'data-fud-space']);
    expect(frameworkAttributesOf(pageElement('<p></p>', 'p'))).toEqual(['data-fud-space']);
  });

  it('an attribute named by an expression is not read as a name', () => {
    const graph = graphOf('/c.fud', { '/c.fud': component('x-c', '<input bus:(ch)=@h>') });
    const input = find(graph.entry.type === 'component-document' ? graph.entry.template!.children : [], 'input')!;
    expect(input.attributes.some((a) => typeof a.name !== 'string')).toBe(true);
    expect(frameworkAttributesOf(input)).toEqual(['aria-invalid', 'aria-label', 'data-fud-space']);
  });

  it('every attribute `@fudic/forms` writes at runtime is on the list', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const root = resolve(here, '../../../forms/src');
    const written = new Set<string>();
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (name.endsWith('.ts')) {
          const text = readFileSync(path, 'utf8');
          for (const m of text.matchAll(/\b(?:setAttribute|toggleAttribute)\(\s*(['"`])([^'"`]+)\1/gu)) {
            written.add(m[2]!);
          }
        }
      }
    };
    walk(root);
    expect(written.size).toBeGreaterThan(0);
    // The union over what each kind of element the runtime touches can carry.
    const listed = new Set([
      ...frameworkAttributesOf(pageElement('<input control="x">', 'input')),
      ...frameworkAttributesOf(pageElement('<form control="x"></form>', 'form')),
      ...frameworkAttributesOf(pageElement('<p error="x"></p>', 'p')),
      ...frameworkAttributesOf(pageElement('<input>', 'input')),
    ]);
    for (const attr of written) expect(listed, `@fudic/forms writes ${attr}`).toContain(attr);
  });
});

describe('pageTokenConsumers (criterion 14)', () => {
  const files: Record<string, string> = {
    '/app/_layout.fud':
      '<!DOCTYPE html>\n<html><head>\n<link rel="component" href="./x-shell.fud">\n<style>.l { gap: var(--l) }</style>\n' +
      '<style media="print"></style>\n<meta charset="utf-8">\n@RenderHead()\n</head>\n' +
      '<body><x-shell></x-shell>@RenderBody()</body>\n</html>\n',
    '/app/index.fud':
      '<link rel="layout" href="./_layout.fud">\n<link rel="component" href="./x-outer.fud">\n' +
      '<link rel="component" href="./x-late.fud">\n<link rel="component" href="./x-plain.fud">\n' +
      '<head>\n  <style>.r { color: var(--r) }</style>\n</head>\n' +
      '<x-outer style="color: var(--lit)"></x-outer>\n<x-plain bus:(ch)=@h></x-plain>\n<p style="margin: var(--m) @(data.k)" title="var(--no)">p</p><i style="@(data.s)">i</i>\n',
    '/app/x-shell.fud': component('x-shell', '<b>s</b>', { style: ':host { color: var(--shell) }' }),
    '/app/x-outer.fud': component('x-outer', '<x-inner></x-inner>', {
      style: ':host { color: var(--outer) }',
      links: '<link rel="component" href="./x-inner.fud">\n',
    }),
    '/app/x-inner.fud': component('x-inner', '<i style="padding: var(--inner)">i</i>', {
      style: 'i { color: var(--inner-style) }',
    }),
    // No `<head>`, so no `<style>`.
    '/app/x-plain.fud': component('x-plain', '<b>p</b>'),
    // Only ever created in the browser: in the graph, so in the page.
    '/app/x-late.fud': component('x-late', '<b>l</b>', { style: 'b { color: var(--late) }' }),
    '/app/x-away.fud': component('x-away', '<b>a</b>', { style: 'b { color: var(--away) }' }),
  };
  const consumers = pageTokenConsumers(graphOf('/app/index.fud', files)).join('\n');

  it('the `<style>` of every component of the page, nested and browser-born included', () => {
    for (const token of ['--shell', '--outer', '--inner-style', '--late']) expect(consumers).toContain(token);
  });

  it('never the `<style>` of a component the page does not reach', () => {
    expect(consumers).not.toContain('--away');
  });

  it('the `<style>` of the layout’s head and of the route’s', () => {
    expect(consumers).toContain('--l');
    expect(consumers).toContain('--r');
  });

  it('the literal parts of every `style="…"`, in any scope, and no other attribute', () => {
    expect(consumers).toContain('color: var(--lit)');
    expect(consumers).toContain('margin: var(--m) ');
    expect(consumers).toContain('padding: var(--inner)');
    expect(consumers).not.toContain('--no');
  });

  it('a page’s own head, and an entry with no head', () => {
    const page = pageTokenConsumers(
      graphOf('/p.fud', {
        '/p.fud': '<!DOCTYPE html>\n<html><head><style>p { a: var(--p) }</style></head><body></body></html>',
      }),
    );
    expect(page).toEqual(['p{a:var(--p)}']);
    const route = pageTokenConsumers(
      graphOf('/app/r.fud', {
        '/app/r.fud': '<link rel="layout" href="./_layout.fud">\n<p>x</p>\n',
        '/app/_layout.fud': '<!DOCTYPE html>\n<html><head>\n@RenderHead()\n</head>\n<body>@RenderBody()</body>\n</html>\n',
      }),
    );
    expect(route).toEqual([]);
  });
});

describe('unionSurfaces', () => {
  const mk = (p: Partial<ScopeSurface>): ScopeSurface => ({
    tags: new Set(),
    classes: new Set(),
    ids: new Set(),
    attributes: new Map(),
    openClasses: false,
    openIds: false,
    slotted: null,
    parts: new Set(),
    ...p,
  });

  it('sets join, `null` wins in attributes, the open flags OR', () => {
    const u = unionSurfaces([
      mk({
        tags: new Set(['a']),
        classes: new Set(['x']),
        ids: new Set(['i']),
        attributes: new Map<string, ReadonlySet<string> | null>([
          ['k', new Set(['1'])],
          ['n', null],
          ['m', new Set(['1'])],
        ]),
        openClasses: true,
      }),
      mk({
        tags: new Set(['b']),
        attributes: new Map<string, ReadonlySet<string> | null>([
          ['k', new Set(['2'])],
          ['n', new Set(['3'])],
          ['m', null],
        ]),
        openIds: true,
      }),
    ]);
    expect(sorted(u.tags)).toEqual(['a', 'b']);
    expect(sorted(u.classes)).toEqual(['x']);
    expect(sorted(u.ids)).toEqual(['i']);
    expect(u.attributes.get('k')).toEqual(new Set(['1', '2']));
    expect(u.attributes.get('n')).toBeNull();
    expect(u.attributes.get('m')).toBeNull();
    expect(u.openClasses).toBe(true);
    expect(u.openIds).toBe(true);
  });

  it('`slotted` joins, or stays `null`; `parts` is `any` when one is', () => {
    const joined = unionSurfaces([
      mk({ slotted: mk({ tags: new Set(['p']) }), parts: new Set(['a']) }),
      mk({ slotted: mk({ tags: new Set(['q']) }), parts: new Set(['b']) }),
    ]);
    expect(sorted(joined.slotted!.tags)).toEqual(['p', 'q']);
    expect(joined.parts).toEqual(new Set(['a', 'b']));
    const open = unionSurfaces([mk({ parts: 'any' }), mk({ parts: new Set(['b']) })]);
    expect(open.slotted).toBeNull();
    expect(open.parts).toBe('any');
    expect(unionSurfaces([mk({ parts: new Set(['b']) }), mk({ parts: 'any' })]).parts).toBe('any');
  });

  it('of nothing, an empty surface', () => {
    const none = unionSurfaces([]);
    expect(none.tags.size).toBe(0);
    expect(none.slotted).toBeNull();
    expect(none.parts).toEqual(new Set());
  });
});
