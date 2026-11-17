// @vitest-environment happy-dom
/**
 * SDD-85 criterion 8 — what the browser creates is what the server paints.
 *
 * For every fixture with a client controller, with props that close every block and props that
 * open every one: the tree `c` builds from its template and the tree the parser makes of the
 * server's HTML are the same tree, node for node — kind, name, namespace, attributes and text —
 * but for what §5 lets differ: the order of the attributes, where one text node ends, and the
 * `class=""` an emptied list leaves. The components of `examples/basic` are held to the same
 * comparison in that package, where their modules resolve.
 *
 * A block a fixture opens from its own state (`app-card`'s `expanded`) is opened by starting that
 * state open, in a copy of the fixture: the server and the browser read the same source.
 */

import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { browserDom } from '@fudic/dom';
import { resolveComponents, type ComponentGraph, type ResolveIo } from '../../src/emit/index.js';
import { fixturesDir, fixtureIo, memoryIo } from './_support.js';
import { clientFactory, controller, mountAsDsd, serverShadowHtml } from './hydrate/_harness.js';
import { treeOf } from '../helpers/tree-compare.js';

/** The fixtures' graph, with one file's source rewritten. */
function graphWith(file: string, edit: (source: string) => string): ComponentGraph {
  const io: ResolveIo = {
    ...fixtureIo,
    read: (p) => (p.endsWith(file) ? edit(fixtureIo.read(p)) : fixtureIo.read(p)),
  };
  return resolveComponents(join(fixturesDir, 'home.fud'), io);
}

const graph = resolveComponents(join(fixturesDir, 'home.fud'), fixtureIo);
// `app-card`'s two `@if`s read `expanded()`, a signal of its own that starts closed.
const opened = graphWith('app-card.fud', (s) => s.replace('signal(false)', 'signal(true)'));
// No page of the fixtures uses `app-panel`: one that does, beside them.
const PANEL_PAGE = join(fixturesDir, 'panel-page.fud');
const panels = resolveComponents(PANEL_PAGE, {
  ...fixtureIo,
  read: (p) =>
    p === PANEL_PAGE
      ? '<link rel="component" href="./app-panel.fud">\n<html><head></head><body><app-panel></app-panel></body></html>\n'
      : fixtureIo.read(p),
});

/** The server's tree, parsed as a browser parses it. */
function painted(g: ComponentGraph, tag: string, props: Record<string, unknown>): string {
  const { shadow } = mountAsDsd(tag, serverShadowHtml(g, tag, props));
  return treeOf(shadow, { skip: ['data-fud-id'] });
}

/** The tree `c` creates, from nothing, with the same props in the order the component declares. */
function created(g: ComponentGraph, tag: string, values: readonly unknown[]): string {
  const host = document.createElement(tag);
  const shadow = host.attachShadow({ mode: 'open' });
  document.body.append(host);
  controller(clientFactory(g, tag), browserDom, shadow, values).c();
  return treeOf(shadow, { emptyClass: true });
}

interface Case {
  readonly name: string;
  readonly tag: string;
  readonly props: Record<string, unknown>;
  readonly values: readonly unknown[];
  readonly graph?: ComponentGraph;
}

const rows = [
  { id: 'a', label: 'Uno' },
  { id: 'b', label: 'Una etiqueta bastante larga' },
];

const CASES: readonly Case[] = [
  { name: 'app-actions, no row', tag: 'app-actions', props: {}, values: [] },
  { name: 'app-actions, two rows', tag: 'app-actions', props: { rows }, values: [rows] },
  { name: 'app-badge, by default', tag: 'app-badge', props: {}, values: [] },
  { name: 'app-badge, with a tone', tag: 'app-badge', props: { tone: 'success' }, values: ['success'] },
  { name: 'app-button, by default', tag: 'app-button', props: {}, values: [] },
  { name: 'app-button, ghost and disabled', tag: 'app-button', props: { variant: 'ghost', disabled: true }, values: ['ghost', true] },
  { name: 'app-calendar, no day', tag: 'app-calendar', props: {}, values: [] },
  {
    name: 'app-calendar, two days',
    tag: 'app-calendar',
    props: { days: [{ id: 'd1', n: 1 }, { id: 'd2', n: 2 }] },
    values: [[{ id: 'd1', n: 1 }, { id: 'd2', n: 2 }]],
  },
  { name: 'app-card, closed', tag: 'app-card', props: { title: 'Hola' }, values: ['Hola'] },
  {
    name: 'app-card, open',
    tag: 'app-card',
    props: { title: 'Hola', variant: 'highlight' },
    values: ['Hola', 'highlight'],
    graph: opened,
  },
  { name: 'app-list, empty', tag: 'app-list', props: {}, values: [] },
  {
    name: 'app-list, rows with and without tags',
    tag: 'app-list',
    props: { rows: [{ id: 'a', label: 'A', tags: ['x', 'y'] }, { id: 'b', label: 'B', tags: [] }] },
    values: [[{ id: 'a', label: 'A', tags: ['x', 'y'] }, { id: 'b', label: 'B', tags: [] }]],
  },
  { name: 'app-panel, no row', tag: 'app-panel', props: {}, values: [], graph: panels },
  { name: 'app-panel, a short row and a long one', tag: 'app-panel', props: { rows, title: 'T' }, values: [rows, 'T'], graph: panels },
];

describe('criterion 8 — c creates what the server paints, over the fixtures', () => {
  it.each(CASES)('$name', ({ tag, props, values, graph: g = graph }) => {
    const server = painted(g, tag, props);
    // Something was painted at all: an empty tree on both sides proves nothing.
    expect(server).not.toBe('');
    expect(created(g, tag, values)).toBe(server);
  });

  it('opens every block of the fixtures in one case or another', () => {
    // The open cases do paint what the closed ones do not.
    expect(painted(opened, 'app-card', { title: 'Hola' })).toContain('<div class="body">');
    expect(painted(graph, 'app-list', {})).toContain('Sin elementos');
    expect(painted(panels, 'app-panel', { rows })).toContain('<small>');
  });
});

/**
 * The shapes a template does not say on its own: text that shares its stretch with a block, a
 * block at the root of another, a marker, SVG, the value of a `<select>`, the three forms of
 * `class`, a spread, a child host, `@raw` and a data `<script>`. One component per shape, each
 * created closed and open.
 */
describe('criterion 8 — the shapes around a block', () => {
  const CODE =
    '@code {\n  const { on = false, xs = [], name = "", sel = "a", cls = "" } = ' +
    'props<{ on?: boolean; xs?: string[]; name?: string; sel?: string; cls?: string }>();\n}\n';
  const SHAPES: Record<string, string> = {
    'x-inline': '<p>Hola @if (on) {<b>sí</b>} mundo @name.</p><p>@name @if (on) {<i>i</i>}</p>',
    'x-root':
      '@if (on) {<i>a</i>} texto @foreach (const x of xs) key (x) { <b>@x</b> } fin\n' +
      '@switch (name) { case "n": { <u>n</u> } default: { <s>d</s> } }',
    'x-nested': '<div>@if (on) { antes @if (on) {<u>u</u>} después @name }</div>',
    'x-marker': '<div>@name @if (on) { <b></b> } @name</div>',
    'x-svg': '<svg viewBox="0 0 2 2">@if (on) {<circle r="1"></circle>}<g>@foreach (const x of xs) key (x) {<rect id="@x"></rect>}</g></svg>',
    'x-select':
      '<select value="@sel"><option value="a">A</option><option value="b" selected>B</option></select>' +
      '<textarea>@name</textarea>',
    'x-class': '<p class="a b" class:b=@on class:c=@on>p</p><p class="@cls" class:d=@on>q</p>',
    'x-spread': '<ul>@foreach (const x of xs) key (x) {<li ...@({ title: x, "data-n": x })>@x</li>}</ul>',
    'x-host': '@if (on) {<x-leaf .label=@name>luz</x-leaf>}<x-leaf .label=@name></x-leaf>',
    'x-raw': '@if (on) {<div>@raw(name)</div>}<hr>',
    'x-data': '<hr>@if (on) {<script type="application/ld+json">{"a":1}</script>}',
    'x-for': '<ol>@for (let i = 0; i < xs.length; i++) key (i) {<li>@i</li>} @empty {<li>nada</li>}</ol>',
    // An `@{ }` between two blocks: it is no node of the template, and the second keeps its place.
    'x-code': '<p>@if (on) {<i>i</i>}@{ void name; }@if (on) {<b>@name</b>}</p>',
  };
  const files: Record<string, string> = {
    '/x-leaf.fud':
      '@code {\n  const { label = "" } = props<{ label?: string }>();\n}\n' +
      '<x-leaf>\n  <template shadowrootmode="open"><span>@label</span><slot></slot></template>\n</x-leaf>\n',
  };
  for (const [tag, markup] of Object.entries(SHAPES)) {
    files[`/${tag}.fud`] =
      '<link rel="component" href="./x-leaf.fud">\n' +
      `${CODE}<${tag}>\n  <template shadowrootmode="open">${markup}</template>\n</${tag}>\n`;
  }
  files['/page.fud'] =
    Object.keys(files).map((path) => `<link rel="component" href=".${path}">`).join('\n') +
    '\n<html><head></head><body></body></html>\n';
  const shapes = resolveComponents('/page.fud', memoryIo(files));

  const closed = { on: false, xs: [], name: '', sel: 'a', cls: '' };
  const open = { on: true, xs: ['p', 'q'], name: 'n', sel: 'b', cls: 'x y' };
  const valuesOf = (p: typeof open): unknown[] => [p.on, p.xs, p.name, p.sel, p.cls];

  for (const tag of Object.keys(SHAPES)) {
    it.each([
      ['closed', closed],
      ['open', open],
    ] as const)(`${tag}, %s`, (_, props) => {
      const server = painted(shapes, tag, props);
      expect(server).not.toBe('');
      expect(created(shapes, tag, valuesOf(props))).toBe(server);
    });
  }
});
