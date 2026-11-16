// @vitest-environment happy-dom
/**
 * SDD-85 §4.1 — the template of a piece of view: what the server would paint for it with every
 * value empty and every block closed. Criteria 2, 3, 4, 5 and 6 on the HTML the emit writes, and
 * the pieces it is written with.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { template, templateIn } from '@fudic/dom';
import {
  emitComponentClientModule,
  emitRouteClientModule,
  resolveComponents,
  resolveDocument,
  type ComponentGraph,
  type ResolveIo,
} from '../../src/emit/index.js';
import { decodeEntities } from '../../src/html/index.js';
import type { LinkedApi } from '../../src/types/io.js';
import { CodeWriter } from '../../src/emit/writer.js';
import {
  childrenNamespace,
  elementNamespace,
  literalBody,
  TemplateHtml,
  Templates,
  writeTemplates,
} from '../../src/emit/template-html.js';
import { memoryIo } from './_support.js';
import { serverShadowHtml } from './hydrate/_harness.js';

/** One `const $TN = $template…` of a chunk: its constant, its function and its literal. */
interface Declared {
  readonly name: string;
  readonly fn: '$template' | '$templateIn';
  readonly literal: string;
}

const DECLARATION = /^const (\$T\d+) = (\$template(?:In)?)(`(?:\\[\s\S]|[^`\\])*`);$/gmu;

function declared(chunk: string): Declared[] {
  return [...chunk.matchAll(DECLARATION)].map((m) => ({
    name: m[1]!,
    fn: m[2] as Declared['fn'],
    literal: m[3]!,
  }));
}

/** The text a literal cooks to: what `template` receives. */
function cooked(literal: string): string {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function('$t', `return $t${literal};`)((s: TemplateStringsArray) => s[0]) as string;
}

/** The fragment a declaration clones, through the real `template` / `templateIn`. */
function cloneOf(d: Declared): DocumentFragment {
  const fn = d.fn === '$template' ? template : templateIn;
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return (new Function('$t', `return $t${d.literal};`)(fn) as () => DocumentFragment)();
}

const CODE = '@code {\n  const { name, href, on } = props<{ name: string; href: string; on: boolean }>();\n}\n';

function graphOf(tag: string, view: string, children: Record<string, string> = {}): ComponentGraph {
  const links = [tag, ...Object.keys(children)].map((t) => `<link rel="component" href="./${t}.fud">`).join('\n');
  const files: Record<string, string> = {
    '/page.fud': `${links}\n<html><head></head><body><${tag}></${tag}></body></html>\n`,
    [`/${tag}.fud`]: `${CODE}<${tag}>\n  <template shadowrootmode="open">${view}</template>\n</${tag}>\n`,
  };
  for (const [child, body] of Object.entries(children)) {
    files[`/${child}.fud`] = `<${child}>\n  <template shadowrootmode="open">${body}</template>\n</${child}>\n`;
  }
  return resolveComponents('/page.fud', memoryIo(files));
}

function chunkOf(graph: ComponentGraph, tag: string): string {
  return emitComponentClientModule(graph, graph.components.get(tag)!);
}

/** The root template of a component: the last one its chunk declares. */
function rootTemplate(graph: ComponentGraph, tag: string): string {
  return cooked(declared(chunkOf(graph, tag)).at(-1)!.literal);
}

describe('the pieces the template is written with', () => {
  it('serializes as the server: escaped attributes and text, void elements, raw text', () => {
    const t = new TemplateHtml('html');
    t.open('p');
    t.attr('title', 'a "b" & c');
    t.attr('title', 'last');
    t.attr('id', 'x');
    t.text('1 < 2 & 3 > 0');
    t.text('');
    t.open('br');
    t.close();
    t.comment();
    t.close();
    t.open('script');
    t.text('{"a":"<b>&"}');
    t.close();
    t.open('img');
    t.close();
    expect(t.html).toBe('<p title="last" id="x">1 &lt; 2 &amp; 3 &gt; 0<br><!----></p><script>{"a":"<b>&"}</script><img>');
    expect(t.ns).toBe('html');
  });

  it('escapes what a template literal would read as code, and nothing else', () => {
    expect(literalBody('a ` b ${c} \\d $e {f}')).toBe('a \\` b \\${c} \\\\d $e {f}');
    expect(cooked(`\`${literalBody('a ` b ${c} \\d $e')}\``)).toBe('a ` b ${c} \\d $e');
  });

  it('knows the namespace each level is parsed in', () => {
    expect(elementNamespace('html', 'div')).toBe('html');
    expect(elementNamespace('html', 'SVG')).toBe('svg');
    expect(elementNamespace('html', 'math')).toBe('math');
    expect(elementNamespace('svg', 'g')).toBe('svg');
    expect(elementNamespace('svg', 'math')).toBe('svg');
    expect(elementNamespace('math', 'svg')).toBe('svg');
    expect(elementNamespace('math', 'mrow')).toBe('math');
    expect(childrenNamespace('svg', 'foreignObject')).toBe('html');
    expect(childrenNamespace('svg', 'desc')).toBe('html');
    expect(childrenNamespace('svg', 'g')).toBe('svg');
    expect(childrenNamespace('math', 'mi')).toBe('html');
    expect(childrenNamespace('math', 'mrow')).toBe('math');
    expect(childrenNamespace('html', 'div')).toBe('html');
  });

  it('declares one constant per distinct template, imports only what it calls, and skips empty ones', () => {
    const none = new Templates();
    expect(none.importLine).toBeNull();
    const w = new CodeWriter();
    writeTemplates(w, none);
    expect(w.empty).toBe(true);

    const templates = new Templates();
    const a = new TemplateHtml('html');
    a.text('a');
    const again = new TemplateHtml('html');
    again.text('a');
    const svg = new TemplateHtml('svg');
    svg.open('circle');
    svg.close();
    expect(templates.add(new TemplateHtml('html'), 0)).toBeNull();
    expect(templates.add(a, 1)).toBe('$T0');
    expect(templates.add(again, 2)).toBe('$T0');
    expect(templates.importLine).toBe("import { template as $template } from '@fudic/dom';");
    expect(templates.add(svg, 3)).toBe('$T1');
    expect(templates.declarations.map((d) => d.text)).toEqual([
      'const $T0 = $template`a`;',
      'const $T1 = $templateIn`<svg><circle></circle></svg>`;',
    ]);
    const math = new Templates();
    const mi = new TemplateHtml('math');
    mi.text('x');
    math.add(mi, 4);
    expect(math.importLine).toBe("import { templateIn as $templateIn } from '@fudic/dom';");
    expect(math.declarations.map((d) => d.text)).toEqual(['const $T0 = $templateIn`<math>x</math>`;']);
    writeTemplates(w, templates);
    expect(w.toString()).toBe(
      [
        "import { template as $template, templateIn as $templateIn } from '@fudic/dom';",
        'const $T0 = $template`a`;',
        'const $T1 = $templateIn`<svg><circle></circle></svg>`;',
      ].join('\n'),
    );
  });
});

describe('criterion 2 — what a template holds', () => {
  const graph = graphOf(
    'x-tpl',
    '<section id="s" class="card" title="@name" data-n="@on">' +
      '<p>Hola @(name)</p>' +
      '<p>@name @if (on) { <b>si</b> } @href</p>' +
      '@if (on) { <em>abierto</em> }' +
      '<a href="@href" .x="@name" @click="@(() => {})">ir</a>' +
      '<x-child id="c" .label="@name"></x-child>' +
      '</section>',
    { 'x-child': '<i>child</i>' },
  );

  it('keeps the statics, the run with its holes empty, the separator, no block and the child host empty', () => {
    expect(rootTemplate(graph, 'x-tpl')).toBe(
      '<section id="s" class="card">' +
        '<p>Hola </p>' +
        '<p> <!----> </p>' +
        '<a>ir</a>' +
        '<x-child id="c"></x-child>' +
        '</section>',
    );
  });

  it('gives the block its own template, and the child its own', () => {
    const own = declared(chunkOf(graph, 'x-tpl')).map((d) => cooked(d.literal));
    // Text may follow the `@if` in its `<p>`: the body that ends with text closes with a comment.
    expect(own).toContain(' <b>si</b> <!---->');
    expect(own).toContain(' <em>abierto</em> ');
    expect(own.join('')).not.toContain('<i>child</i>');
    expect(declared(chunkOf(graph, 'x-child')).map((d) => cooked(d.literal))).toEqual(['<i>child</i>']);
  });

  it('declares them at the top of the module, before the component', () => {
    const chunk = chunkOf(graph, 'x-tpl');
    expect(chunk).toContain("import { template as $template } from '@fudic/dom';");
    expect(chunk.indexOf('const $T0')).toBeLessThan(chunk.indexOf('customElements.define'));
  });

  it('one template per branch and per body: else, case and loops', () => {
    const blocks = graphOf(
      'x-arms',
      '@if (on) { <i>1</i> } else { <i>2</i> }' +
        '@switch (name) { case "a": <i>3</i> default: <i>4</i> }' +
        '<ul>@foreach (const c of [...name]) key (c) { <li>5</li> } @empty { <li>6</li> }</ul>' +
        '@for (let i = 0; i < 2; i++) key (i) { <i>7</i> }',
    );
    const html = declared(chunkOf(blocks, 'x-arms')).map((d) => cooked(d.literal).trim());
    // A body that ends with text closes with a comment when text may follow it: the `@switch`
    // behind the `@if` opens with some, and so does the next row of the `@for` (`marker.ts`).
    for (const n of ['1', '2', '7']) expect(html).toContain(`<i>${n}</i> <!---->`);
    for (const n of ['3', '4']) expect(html).toContain(`<i>${n}</i>`);
    expect(html).toContain('<li>5</li>');
    expect(html).toContain('<li>6</li>');
  });
});

describe('a route has no root template, and each branch of its `@await` has one', () => {
  it('declares the body and the `@catch`, and nothing for the route itself', () => {
    const api: LinkedApi = {
      id: 'routes/r',
      load: true,
      route: '/r.fud',
      paths: false,
      layout: false,
      functions: [],
      forms: [],
      later: ['users'],
    };
    const route = [
      '<link rel="layout" href="./l.fud">',
      '<link rel="server" href="./r.fudapi">',
      '@code { const n = signal(1); }',
      '<h1 class="top">@n()</h1>',
      '@await data.users { <ul class="users"></ul> } @catch (e) { <p class="error">@e.status (@e.title)</p> }',
    ].join('\n');
    const io: ResolveIo = {
      ...memoryIo({ '/r.fud': route, '/l.fud': '<!DOCTYPE html><html><head>@RenderHead()</head><body>@RenderBody()</body></html>' }),
      api: (path) => (path === '/r.fudapi' ? api : undefined),
    };
    const html = declared(emitRouteClientModule(resolveDocument('/r.fud', io).value)!).map((d) => cooked(d.literal));
    // What follows a route is its layout's, which may be text: each body closes with a comment.
    expect(html).toEqual([' <ul class="users"></ul> <!---->', ' <p class="error"> ()</p> <!---->']);
  });
});

describe('criterion 4 — special contents, as the server writes them', () => {
  const view =
    '<textarea name="t">a &lt; b</textarea>' +
    '<title>T &amp; c</title>' +
    '<script type="application/ld+json">{"a": "<b>&amp;"}</script>' +
    // Not a data block for fudic (decision 129): the server writes it empty, and so does this.
    '<script type="application/json"></script>' +
    '<template><p>dentro</p></template>' +
    '<div>@raw(name)</div>' +
    '<p class="x" class:x="@on">x</p>';
  const graph = graphOf('x-special', view);

  it('is byte for byte the server markup where nothing is dynamic', () => {
    const fixed = graphOf('x-fixed', view.replace('@raw(name)', '').replace(' class:x="@on"', ''));
    expect(rootTemplate(fixed, 'x-fixed')).toBe(serverShadowHtml(fixed, 'x-fixed', {}));
  });

  it('keeps the element of an `@raw` empty and leaves out a token its `class:` owns', () => {
    const html = rootTemplate(graph, 'x-special');
    expect(html).toContain('<div></div>');
    expect(html).toContain('<p>x</p>');
    expect(html).toContain('<script type="application/ld+json">{"a": "<b>&amp;"}</script>');
    expect(html).toContain('<textarea name="t">a &lt; b</textarea><title>T &amp; c</title>');
    expect(html).toContain('<template><p>dentro</p></template>');
  });
});

describe('criterion 5 — a static text with `, ${ and \\ comes out right in the DOM', () => {
  it('cooks back to the text the author wrote', () => {
    const graph = graphOf('x-esc', '<p>a ` b ${c} \\d</p><p title="`${x}`\\">t</p>');
    const d = declared(chunkOf(graph, 'x-esc')).at(-1)!;
    const fragment = cloneOf(d);
    const [first, second] = [...fragment.querySelectorAll('p')];
    expect(first!.textContent).toBe('a ` b ${c} \\d');
    expect(second!.getAttribute('title')).toBe('`${x}`\\');
    expect(cooked(d.literal)).toBe(serverShadowHtml(graph, 'x-esc', {}));
  });
});

describe('criterion 6 — a block inside an `<svg>` is created in the SVG namespace', () => {
  const graph = graphOf(
    'x-svg',
    '<svg viewBox="0 0 2 2"><g>@if (on) { <circle r="1"></circle> }</g>' +
      '<foreignObject>@if (on) { <p>html</p> }</foreignObject></svg>',
  );

  it('wraps the body in `<svg>` and clones its children, without the wrapper', () => {
    const all = declared(chunkOf(graph, 'x-svg'));
    const circle = all.find((d) => d.literal.includes('circle'))!;
    expect(circle.fn).toBe('$templateIn');
    expect(cooked(circle.literal)).toBe('<svg> <circle r="1"></circle> </svg>');
    const node = cloneOf(circle).querySelector('circle')!;
    expect(node.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(node.parentNode!.nodeType).toBe(11); // the fragment: no wrapper left
  });

  it('an HTML integration point is HTML again', () => {
    const p = declared(chunkOf(graph, 'x-svg')).find((d) => d.literal.includes('<p>'))!;
    expect(p.fn).toBe('$template');
    expect(cloneOf(p).querySelector('p')!.namespaceURI).toBe('http://www.w3.org/1999/xhtml');
  });
});

/* ------------------------------------------------------------------------------------------
 * Criterion 3, over every component and route of `examples/basic`.
 * ------------------------------------------------------------------------------------------ */

const here = dirname(fileURLToPath(import.meta.url));
const basic = resolve(here, '../../../../examples/basic/src');

const fsIo: ResolveIo = {
  read: (p) => readFileSync(p, 'utf8'),
  resolve: (from, href) => resolve(dirname(from), href),
};

function routesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'fixtures' ? [] : routesUnder(path);
    return name.endsWith('.fud') ? [path] : [];
  });
}

/** Every chunk of the example, by file, and the static facts of every source it was built from. */
function exampleChunks(): { chunks: Map<string, string>; attrs: Set<string>; classes: Set<string>; words: Set<string> } {
  const chunks = new Map<string, string>();
  const attrs = new Set<string>();
  const classes = new Set<string>();
  const words = new Set<string>();
  const seen = new WeakSet<object>();
  const walk = (value: unknown): void => {
    if (typeof value !== 'object' || value === null || seen.has(value)) return;
    seen.add(value);
    const node = value as { type?: string; name?: unknown; attributes?: unknown[]; value?: unknown };
    if (node.type === 'element' && Array.isArray(node.attributes)) {
      for (const attr of node.attributes as { name?: unknown; value?: { type: string; value?: string }[] }[]) {
        const parts = attr.value ?? [];
        if (typeof attr.name !== 'string' || !parts.every((p) => p.type === 'attribute-text')) continue;
        const text = decodeEntities(parts.map((p) => p.value ?? '').join(''));
        attrs.add(`${attr.name.toLowerCase()}=${text}`);
        if (attr.name === 'class') for (const token of text.split(/\s+/u)) classes.add(token);
      }
    }
    // The literal text of a child list, run by run, with every hole empty: what a run of the
    // template holds. A text beside an `@@` or an interpolation is one string.
    const children = (value as { children?: unknown }).children;
    if (Array.isArray(children)) {
      let run = '';
      for (const child of [...children, null] as ({ type?: string; value?: string } | null)[]) {
        if (child?.type === 'text') run += decodeEntities(child.value ?? '');
        else if (child?.type === 'at-escape') run += '@';
        else if (child?.type === 'razor-expression') continue;
        else {
          for (const word of run.split(/\s+/u)) words.add(word);
          run = '';
        }
      }
    }
    for (const item of Object.values(value)) walk(item);
  };
  for (const path of routesUnder(join(basic, 'routes'))) {
    const graph = resolveDocument(path, fsIo).value;
    walk(graph.entry);
    const route = emitRouteClientModule(graph);
    if (route !== null) chunks.set(path, route);
    for (const comp of graph.components.values()) {
      if (chunks.has(comp.path)) continue;
      walk(comp.doc);
      chunks.set(comp.path, emitComponentClientModule(graph, comp));
    }
  }
  return { chunks, attrs, classes, words };
}

/** What the compiler itself writes on an element, never out of the author's values. */
const COMPILER_ATTRS = new Set([
  'data-fud-adopt',
  'data-fud-sheets',
  'id',
  'aria-describedby',
  'aria-live',
  'novalidate',
  'accept',
  'tabindex',
  'slot',
]);

describe('criterion 3 — no value of examples/basic is in any template', () => {
  const { chunks, attrs, classes, words } = exampleChunks();
  const templates = [...chunks.values()].flatMap(declared);

  it('compiles the example and finds templates in it', () => {
    expect(chunks.size).toBeGreaterThan(50);
    expect(templates.length).toBeGreaterThan(50);
  });

  it('criterion 7 — no chunk builds an element by hand, and none composes a class', () => {
    for (const [file, code] of chunks) {
      expect(code, file).not.toContain('$dom.element(');
      expect(code, file).not.toContain('filter(Boolean)');
    }
  });

  it('every attribute of every template is one the author wrote literally, or one the compiler adds', () => {
    const strays: string[] = [];
    for (const d of templates) {
      for (const el of cloneOf(d).querySelectorAll('*')) {
        for (const { name, value } of el.attributes) {
          if (COMPILER_ATTRS.has(name)) continue;
          if (name === 'class' && value.split(' ').every((t) => classes.has(t))) continue;
          if (!attrs.has(`${name}=${value}`)) strays.push(`${d.name}: ${name}="${value}"`);
        }
      }
    }
    expect(strays).toEqual([]);
  });

  it('every word of every template is one the author wrote as text', () => {
    const strays: string[] = [];
    for (const d of templates) {
      const walker = document.createTreeWalker(cloneOf(d), NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        for (const word of node.nodeValue!.split(/\s+/u)) {
          if (word !== '' && !words.has(word)) strays.push(`${d.name}: ${word}`);
        }
      }
    }
    expect(strays).toEqual([]);
  });

  it('and no literal has a hole', () => {
    for (const d of templates) expect(d.literal).not.toMatch(/(?<!\\)\$\{/u);
  });
});
