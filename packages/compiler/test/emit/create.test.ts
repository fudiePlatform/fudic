// @vitest-environment happy-dom
/**
 * SDD-85 §4.2 — the new `c`: clone the template, adopt the clone with every block closed, write
 * every value once, and hook up. Run over a live DOM: what it creates, what it does after, and
 * where the lines it is made of point in the `.fud`.
 */

import { describe, expect, it } from 'vitest';
import { browserDom } from '@fudic/dom';
import {
  emitComponentClientModule,
  emitComponentClientModuleMapped,
  resolveComponents,
  type ComponentGraph,
} from '../../src/emit/index.js';
import { memoryIo } from './_support.js';
import { clientFactory, controller, mountAsDsd, serverShadowHtml } from './hydrate/_harness.js';
import { treeOf } from '../helpers/tree-compare.js';

/** One component per tag, with a page that links them all. */
function graphOf(components: Record<string, string>): ComponentGraph {
  const files: Record<string, string> = {};
  for (const [tag, source] of Object.entries(components)) files[`/${tag}.fud`] = source;
  files['/page.fud'] =
    Object.keys(components).map((tag) => `<link rel="component" href="./${tag}.fud">`).join('\n') +
    '\n<html><head></head><body></body></html>\n';
  return resolveComponents('/page.fud', memoryIo(files));
}

/** A component `.fud` around a template, with its `@code`. */
const component = (tag: string, code: string, template: string, links = ''): string =>
  `${links}@code {\n${code}\n}\n<${tag}>\n  <template shadowrootmode="open">${template}</template>\n</${tag}>\n`;

/** A host in the document with an open shadow root, and the controller `c` created it with. */
function create(g: ComponentGraph, tag: string, values: readonly unknown[]) {
  const host = document.createElement(tag);
  const shadow = host.attachShadow({ mode: 'open' });
  document.body.append(host);
  const ctl = controller(clientFactory(g, tag), browserDom, shadow, values);
  ctl.c();
  return { shadow, ctl };
}

/** What the server paints with `props`, as a tree. */
const painted = (g: ComponentGraph, tag: string, props: Record<string, unknown>): string =>
  treeOf(mountAsDsd(tag, serverShadowHtml(g, tag, props)).shadow, { skip: ['data-fud-id'] });

describe('criterion 9 — a text that is empty when created takes its value in its place', () => {
  const g = graphOf({
    'x-runs': component(
      'x-runs',
      '  const { x = "", y = "" } = props<{ x?: string; y?: string }>();',
      '<p>Hola <b>@x</b> @y fin<i></i></p>',
    ),
  });

  it('created with both empty, then filled', () => {
    const { shadow, ctl } = create(g, 'x-runs', ['', '']);
    // Neither hole left a node in the clone: the adoption made one for each, where it goes.
    expect(shadow.querySelector('b')!.childNodes).toHaveLength(1);
    ctl.u([, , 'x', 'y']);
    expect(shadow.querySelector('b')!.textContent).toBe('x');
    expect(shadow.querySelector('p')!.textContent).toBe('Hola x y fin');
    expect(treeOf(shadow)).toBe(painted(g, 'x-runs', { x: 'x', y: 'y' }));
  });
});

describe('criterion 14 — a child in a template is raised with its props and its own template', () => {
  const g = graphOf({
    'x-kid': component(
      'x-kid',
      '  const { label = "", n = 0 } = props<{ label?: string; n?: number }>();',
      '<span class="kid">@label</span><output>@n</output><slot></slot>',
    ),
    'x-mom': component(
      'x-mom',
      '  const { on = false } = props<{ on?: boolean }>();',
      '<x-kid .label="fijo" .n=@(1)>luz</x-kid>@if (on) {<x-kid .label="dentro" .n=@(2)></x-kid>}',
      '<link rel="component" href="./x-kid.fud">\n',
    ),
  });
  customElements.define('x-kid', clientFactory(g, 'x-kid') as unknown as CustomElementConstructor);

  it('each host comes out of the clone with its light DOM, and its own shadow from its template', () => {
    const { shadow } = create(g, 'x-mom', [true]);
    const kids = [...shadow.querySelectorAll('x-kid')];
    expect(kids).toHaveLength(2);
    expect(kids[0]!.textContent).toBe('luz');
    expect(treeOf(kids[0]!.shadowRoot!)).toBe(painted(g, 'x-kid', { label: 'fijo', n: 1 }));
    expect(treeOf(kids[1]!.shadowRoot!)).toBe(painted(g, 'x-kid', { label: 'dentro', n: 2 }));
  });
});

describe('a control the browser creates carries the default the server paints (SDD-85 §4.2)', () => {
  it('evaluated in place when the view computes in place, and written after the options a block adds', () => {
    const g = graphOf({
      'x-pick': component(
        'x-pick',
        '  const { v = "b", xs = ["a", "b"] } = props<{ v?: string; xs?: string[] }>();',
        '@{ let w = v; }<select value=@w>@foreach (const x of xs) key (x) {<option>@x</option>}</select>@{ w = "z"; }',
      ),
    });
    const code = emitComponentClientModule(g, g.components.get('x-pick')!);
    // In place: the value the default reads is the one the walk evaluated there.
    expect(code).toMatch(/\$dom\.setDefault\(\$n\d+, "value", \$x\[\d+\]\);/u);
    const { shadow } = create(g, 'x-pick', ['b', ['a', 'b']]);
    expect(shadow.querySelector('option[selected]')!.textContent).toBe('b');
    expect(treeOf(shadow)).toBe(painted(g, 'x-pick', { v: 'b', xs: ['a', 'b'] }));
  });
});

describe('a block body with nothing of its own to clone', () => {
  it('creates its texts unattached, and its `m` puts them in their place', () => {
    const g = graphOf({
      'x-bare': component(
        'x-bare',
        '  const { on = false, t = "" } = props<{ on?: boolean; t?: string }>();',
        '<p>a @if (on) {@(t)@if (on) {<b>b</b>}} c</p>',
      ),
    });
    const code = emitComponentClientModule(g, g.components.get('x-bare')!);
    // No template for the body of the outer `@if`: nothing to declare `$f` for.
    expect(code.match(/const \$f = /gu)).toHaveLength(1);
    const { shadow } = create(g, 'x-bare', [true, 'T']);
    expect(shadow.querySelector('p')!.textContent).toBe('a Tb c');
    expect(treeOf(shadow)).toBe(painted(g, 'x-bare', { on: true, t: 'T' }));
  });
});

describe('criterion 23 — the lines of `c` and every template point at the `.fud`', () => {
  const source = component(
    'x-map',
    '  const { on = false, t = "" } = props<{ on?: boolean; t?: string }>();',
    '<section><h2>@t</h2>@if (on) {<em>sí</em>}</section>',
  );
  const g = graphOf({ 'x-map': source });
  const out = emitComponentClientModuleMapped(g, g.components.get('x-map')!);
  /** The `.fud` offset the output maps to at the start of the first line holding `text`. */
  const sourceOf = (text: string, from = 0): number | undefined => {
    const at = out.code.indexOf(text, from);
    return out.mappings.find((m) => m.generatedOffset === at)?.sourceOffset;
  };

  it('a template points at the piece of view it is cloned for', () => {
    expect(sourceOf('const $T0 = ')).toBe(source.indexOf('@if (on)'));
    expect(sourceOf('const $T1 = ')).toBe(source.indexOf('<template shadowrootmode'));
  });

  it('every line of the new `c` points at what it adopts, creates or mounts', () => {
    const c = out.code.indexOf('c: () => {', out.code.lastIndexOf('return {'));
    expect(sourceOf('$dom.append($shadow, $T1());', c)).toBe(source.indexOf('<template shadowrootmode'));
    expect(sourceOf('$n0 = $c0;', c)).toBe(source.indexOf('<section>'));
    expect(sourceOf('$n1 = $c1;', c)).toBe(source.indexOf('<h2>'));
    expect(sourceOf('const $q = $q0();', c)).toBe(source.indexOf('@if (on)'));
    expect(sourceOf('for (const $i of $k0) $i.m(', c)).toBe(source.indexOf('@if (on)'));
    // And the `c` of the block, whose clone is its fragment.
    expect(sourceOf('const $f = $T0();')).toBe(source.indexOf('@if (on)'));
  });
});
