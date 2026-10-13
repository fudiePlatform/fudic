// @vitest-environment happy-dom
/**
 * `...item` (props-spec §5, decisions 146–149) — what the emit makes of a spread.
 *
 * `spreadProps` is the one rule both sides expand with, so it is pinned first, on authentic
 * ASTs: the child's keys filter, an explicit `.prop` wins its key, the later of two spreads
 * wins a key it has. Then each consumer of it: the server's props object, the client's dense
 * payload in the child's order, the level rule, the route's tree. Then the run: a child fed by
 * a spread inside a keyed loop is handed its new props when its row changed — and only then.
 */

import { describe, expect, it } from 'vitest';
import { browserDom } from '@fudic/dom';
import {
  resolveComponents,
  emitComponentClientModuleMapped,
  emitComponentModule,
  emitRouteModule,
  hydratableTags,
  type ComponentGraph,
} from '../../src/emit/index.js';
import { propTarget, spreadProps } from '../../src/emit/attrs.js';
import { resolveDocument } from '../../src/emit/resolve.js';
import { parseDocument, type ElementNode } from '../../src/html/index.js';
import { atConstructs } from '../../src/constructs.js';
import { spreadTarget } from '../../src/semantic/analyzers/spread-target.js';
import type { Diagnostic } from '../../src/types/index.js';
import { memoryIo } from './_support.js';
import { clientFactory, controller } from './hydrate/_harness.js';
import { viewInput } from '../semantic/_view.js';

// ---------------------------------------------------------------------------
// spreadProps — the rule
// ---------------------------------------------------------------------------

const CARD_PROPS = propTarget([
  { name: 'id', required: true },
  { name: 'nombre', required: true },
  { name: 'precio', required: false },
  { name: 'etiqueta', required: false },
]);

function hostOf(markup: string): { el: ElementNode; source: string } {
  const el = parseDocument(markup, { atConstructs }).value.children.find((n) => n.type === 'element') as ElementNode;
  return { el, source: markup };
}

const expanded = (markup: string, declared = CARD_PROPS): Record<string, string> => {
  const { el, source } = hostOf(markup);
  return Object.fromEntries(spreadProps(source, el, declared).map((p) => [p.name, p.expr]));
};

describe('spreadProps', () => {
  it('expands against the CHILD´s keys, in its order, each read off the object (79, 80)', () => {
    const { el, source } = hostOf('<x-card ...item></x-card>');
    expect(spreadProps(source, el, CARD_PROPS)).toEqual([
      { name: 'id', expr: '(item).id' },
      { name: 'nombre', expr: '(item).nombre' },
      { name: 'precio', expr: '(item).precio' },
      { name: 'etiqueta', expr: '(item).etiqueta' },
    ]);
  });

  it('a path is read as one object', () => {
    expect(expanded('<x-card ...row.data></x-card>').id).toBe('(row.data).id');
  });

  it('an explicit .prop wins its key, before or after the spread', () => {
    expect(Object.keys(expanded('<x-card ...item .etiqueta="oferta"></x-card>'))).toEqual(['id', 'nombre', 'precio']);
    expect(Object.keys(expanded('<x-card .id="@k" ...item></x-card>'))).toEqual(['nombre', 'precio', 'etiqueta']);
  });

  it('a control binding wins the key it lands on', () => {
    const declared = propTarget([{ name: 'ctrl', required: false }, { name: 'id', required: true }]);
    expect(Object.keys(expanded('<x-card ...item control="@f.a"></x-card>', declared))).toEqual(['id']);
  });

  it('of two spreads, the later wins a key it HAS — `undefined` is a key it lacks', () => {
    expect(expanded('<x-card ...a ...b></x-card>').id).toBe('((b).id !== undefined ? (b).id : (a).id)');
    const three = expanded('<x-card ...a ...b ...c></x-card>').id;
    // eslint-disable-next-line no-new-func
    const pick = (a: object, b: object, c: object): unknown => new Function('a', 'b', 'c', `return ${three};`)(a, b, c);
    expect(pick({ id: 1 }, { id: 2 }, { id: 3 })).toBe(3);
    expect(pick({ id: 1 }, { id: 2 }, {})).toBe(2);
    expect(pick({ id: 1 }, {}, { id: undefined })).toBe(1);
  });

  it('expands nothing with no spread, a malformed one, or no child contract to read', () => {
    expect(expanded('<x-card .id="@k"></x-card>')).toEqual({});
    expect(expanded('<x-card ...a-b></x-card>')).toEqual({});
    const { el, source } = hostOf('<x-card ...item></x-card>');
    expect(spreadProps(source, el, undefined)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The emitted text
// ---------------------------------------------------------------------------

const CARD =
  '@code {\n' +
  '  const { id, nombre, precio = 0, etiqueta = "normal" } = props<{ id: string; nombre: string; precio?: number; etiqueta?: string }>();\n' +
  '}\n' +
  '<x-card>\n  <template shadowrootmode="open"><span>@id @nombre @precio @etiqueta</span></template>\n</x-card>\n';

const LIST =
  '<link rel="component" href="./x-card.fud">\n' +
  '@code {\n' +
  '  const inicial = [{ id: "p1", nombre: "A", precio: 1, sku: "K-01" }, { id: "p3", nombre: "C", stock: 12 }];\n' +
  '  const fijo = { id: "f", nombre: "F", sku: "Z" };\n' +
  '  @client {\n' +
  "    import { signal } from '@fudic/core';\n" +
  '    const productos = signal(inicial);\n' +
  '    globalThis.__spread = { set: (v) => productos.set(v), get: () => productos() };\n' +
  '  }\n' +
  '}\n' +
  '<x-list>\n  <template shadowrootmode="open">' +
  '<x-card ...fijo></x-card>' +
  '<div>@foreach (const p of productos()) key (p.id) {<x-card ...p .etiqueta="oferta"></x-card>}</div>' +
  '</template>\n</x-list>\n';

function graphOf(files: Record<string, string>, entry: string): ComponentGraph {
  return resolveComponents(
    '/page.fud',
    memoryIo({
      '/page.fud': `<link rel="component" href="./${entry}.fud">\n<html><head></head><body><${entry}></${entry}></body></html>\n`,
      ...files,
    }),
  );
}

describe('the emitted text', () => {
  const graph = graphOf({ '/x-list.fud': LIST, '/x-card.fud': CARD }, 'x-list');
  const server = emitComponentModule(graph, graph.components.get('x-list')!);
  const client = emitComponentClientModuleMapped(graph, graph.components.get('x-list')!).code;

  it('the server hands the child its keys only, the explicit one winning', () => {
    expect(server).toContain(
      'renderXCard($dom, $n1, { "id": (fijo).id, "nombre": (fijo).nombre, "precio": (fijo).precio, "etiqueta": (fijo).etiqueta }, $ioc);',
    );
    expect(server).toMatch(/\{ "id": \(p\)\.id, "nombre": \(p\)\.nombre, "precio": \(p\)\.precio, "etiqueta": "oferta" \}/u);
    expect(server).not.toMatch(/\.sku|\.stock/u);
  });

  it('the client fabricates the child with a dense payload in the child´s order', () => {
    expect(client).toContain('$live($n0, [(fijo).id, (fijo).nombre, (fijo).precio, (fijo).etiqueta]);');
    expect(client).toContain('$live($n2, [(p).id, (p).nombre, (p).precio, "oferta"]);');
  });

  it('the row renews its child only when a parameter really changed', () => {
    expect(client).toContain(
      'u: (...$p) => { const $moved = [p].some(($x, $i) => $x !== $p[$i]); [p] = $p; $a(); if ($moved) $n2.u([, , (p).id, (p).nombre, (p).precio, "oferta"]); },',
    );
  });

  it('the same renewal for a .prop that reads the row, with no spread at all', () => {
    const dots = LIST.replace('<x-card ...p .etiqueta="oferta">', '<x-card .id="@p.id" .nombre="@p.nombre">');
    const g = graphOf({ '/x-list.fud': dots, '/x-card.fud': CARD }, 'x-list');
    const code = emitComponentClientModuleMapped(g, g.components.get('x-list')!).code;
    expect(code).toContain('const $moved = [p].some(($x, $i) => $x !== $p[$i]);');
    expect(code).toMatch(/if \(\$moved\) \$n\d+\.u\(\[, , \(p\.id\), \(p\.nombre\)\]\);/u);
  });

  it('a constant object outside a construct is handed over once, and never again', () => {
    expect(client).not.toMatch(/\$n0\.u\(/u);
  });
});

describe('the emitted text — a spread whose object moves', () => {
  const PARENT =
    '<link rel="component" href="./x-card.fud">\n' +
    '@code {\n' +
    '  const { item } = props<{ item: { id: string; nombre: string } }>();\n' +
    "  @client { import { signal } from '@fudic/core'; const n = signal(0); }\n" +
    '}\n' +
    '<x-par>\n  <template shadowrootmode="open"><x-card ...item></x-card><i>@n()</i></template>\n</x-par>\n';
  const graph = graphOf({ '/x-par.fud': PARENT, '/x-card.fud': CARD }, 'x-par');
  const client = emitComponentClientModuleMapped(graph, graph.components.get('x-par')!).code;

  it('renews the whole payload in the update pass, as a moving .prop would (81)', () => {
    expect(client).toMatch(/\$n0\.u\(\[, , \(item\)\.id, \(item\)\.nombre, \(item\)\.precio, \(item\)\.etiqueta\]\)/u);
    expect(client).not.toContain('$moved');
  });
});

// ---------------------------------------------------------------------------
// Who hydrates, and what the route lists
// ---------------------------------------------------------------------------

describe('the level rule', () => {
  const parent = (code: string, host: string): string =>
    '<link rel="component" href="./x-card.fud">\n' +
    `@code {\n${code}\n  @client { import { signal } from '@fudic/core'; const n = signal(0); }\n}\n` +
    `<x-par>\n  <template shadowrootmode="open">${host}<i>@n()</i></template>\n</x-par>\n`;

  it('a spread of something that moves makes the child hydrate', () => {
    const graph = graphOf(
      { '/x-par.fud': parent('  const { item } = props<{ item: { id: string } }>();', '<x-card ...item></x-card>'), '/x-card.fud': CARD },
      'x-par',
    );
    expect([...hydratableTags(graph)].sort()).toEqual(['x-card', 'x-par']);
  });

  it('a spread of a constant induces nothing', () => {
    const graph = graphOf(
      { '/x-par.fud': parent('  const fijo = { id: "f", nombre: "F" };', '<x-card ...fijo></x-card>'), '/x-card.fud': CARD },
      'x-par',
    );
    expect([...hydratableTags(graph)]).toEqual(['x-par']);
  });
});

describe('the route´s tree counts a spread as a prop', () => {
  const LAYOUT = '<!DOCTYPE html><html><head>@RenderHead()</head><body><main>@RenderBody()</main></body></html>';
  const treeOf = (code: string): Record<string, readonly string[]> => {
    const match = /const FUD_TREE = (\{.*\});/u.exec(code);
    return match === null ? {} : (JSON.parse(match[1]!) as Record<string, readonly string[]>);
  };

  it('lists the child it spreads into', () => {
    const route = [
      '<link rel="layout" href="./l.fud">',
      '<link rel="component" href="./x-card.fud">',
      '@code { @client { const item = signal({ id: "a", nombre: "b" }); let cur = { id: "a", nombre: "b" }; } }',
      '<x-card ...cur></x-card>',
      '<output>@item().id</output>',
    ].join('\n');
    const io = memoryIo({ '/r.fud': route, '/l.fud': LAYOUT, '/x-card.fud': CARD });
    const code = emitRouteModule(resolveDocument('/r.fud', io).value, { routeName: 'ruta' });
    expect(treeOf(code)['ruta']).toEqual(['x-card']);
  });
});

// ---------------------------------------------------------------------------
// FUD0992
// ---------------------------------------------------------------------------

function reported(source: string): readonly string[] {
  const out: Diagnostic[] = [];
  spreadTarget.run(viewInput(source), (d) => out.push(d));
  return out.map((d) => `${d.code} ${source.slice(d.span.start, d.span.end)}`);
}

describe('FUD0992 — a spread goes on a component', () => {
  const comp = (markup: string): string =>
    '@code {\n  const item = {};\n}\n' + `<x-a ...item><template shadowrootmode="open">${markup}</template></x-a>\n`;

  it('on a native element', () => {
    // Three: the `<div>`, the nested `<span>` and — first in document order — the wrapper.
    expect(reported(comp('<div ...item></div><p><span ...item></span></p>'))).toEqual([
      'FUD0992 ...item',
      'FUD0992 ...item',
      'FUD0992 ...item',
    ]);
  });

  it('on the component´s own host wrapper, and on an SVG element', () => {
    const source = '@code {\n  const item = {};\n}\n<x-a ...item><template shadowrootmode="open"><svg><font-face ...item></font-face></svg></template></x-a>\n';
    expect(reported(source)).toEqual(['FUD0992 ...item', 'FUD0992 ...item']);
  });

  it('not on a hyphenated tag — a component, or FUD0191´s to report', () => {
    const source = '@code {\n  const item = {};\n}\n<x-a><template shadowrootmode="open"><x-card ...item></x-card><x-otro ...item.k></x-otro></template></x-a>\n';
    expect(reported(source)).toEqual([]);
  });

  it('and not on an element with no spread', () => {
    expect(reported('@code {\n  const k = 1;\n}\n<x-a><template shadowrootmode="open"><p .k="@k" class="a">x</p></template></x-a>\n')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The run: a row that changed hands its child the new props
// ---------------------------------------------------------------------------

/** A stand-in for the child: what is under test is the channel, not the card. */
const created: { el: Element; props: unknown[] }[] = [];
const served: { el: Element; payload: unknown[] }[] = [];
customElements.define(
  'x-card',
  class extends HTMLElement {
    c(props: unknown[]): void {
      created.push({ el: this, props });
    }

    u(payload: unknown[]): void {
      served.push({ el: this, payload });
    }
  },
);

type Probe = { set: (v: unknown) => void; get: () => { id: string; nombre: string }[] };
const probe = (): Probe => (globalThis as unknown as { __spread: Probe }).__spread;

describe('run over a live DOM', () => {
  const graph = graphOf({ '/x-list.fud': LIST, '/x-card.fud': CARD }, 'x-list');

  function drive(): ShadowRoot {
    created.length = 0;
    served.length = 0;
    const host = document.createElement('x-list');
    const shadow = host.attachShadow({ mode: 'open' });
    document.body.append(host);
    controller(clientFactory(graph, 'x-list'), browserDom, shadow, []).c();
    return shadow;
  }

  it('creates each child with its own keys, an absent one as undefined for its default', () => {
    drive();
    expect(created.map((c) => c.props)).toEqual([
      ['f', 'F', undefined, undefined],
      ['p1', 'A', 1, 'oferta'],
      ['p3', 'C', undefined, 'oferta'],
    ]);
  });

  it('a row that kept its key and changed its data hands its child the new props', () => {
    const shadow = drive();
    probe().set(probe().get().map((p) => ({ ...p, nombre: `${p.nombre}!` })));
    const cards = [...shadow.querySelectorAll('div > x-card')];
    expect(served.map((s) => cards.indexOf(s.el))).toEqual([0, 1]);
    expect(served.map((s) => s.payload)).toEqual([
      [, , 'p1', 'A!', 1, 'oferta'],
      [, , 'p3', 'C!', undefined, 'oferta'],
    ]);
  });

  it('a row whose data is the same object hands nothing', () => {
    drive();
    const [first, second] = probe().get();
    probe().set([first, second, { id: 'p9', nombre: 'N' }]);
    // The two kept rows are the same objects: nothing for them. The new one is CREATED.
    expect(served).toEqual([]);
    expect(created.at(-1)!.props).toEqual(['p9', 'N', undefined, 'oferta']);
  });
});
