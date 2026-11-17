// @vitest-environment happy-dom
/**
 * Text on both sides of a block (SDD-85, decided with Pedro on 2026-11-16).
 *
 * HTML keeps no boundary between two texts: `Hola ` and ` adiós` with a closed `@if` between them
 * come back from the parser as ONE node. The client used to find both runs on that node, so a
 * block that opened went before the whole sentence, and a value written into one run wiped the
 * other. Now a comment goes after every run that another run follows with only blocks or `@{ }`s
 * in between (`marker.ts`), the server paints it and the template carries it.
 *
 * Proved on the running trees, for every shape and every change of state: what `h` leaves after
 * an update, and what `c` leaves after the same update, is what the server paints for the new
 * state, character for character.
 */

import { describe, expect, it } from 'vitest';
import { browserDom } from '@fudic/dom';
import { resolveComponents, type ComponentGraph } from '../../../src/emit/index.js';
import { memoryIo } from '../_support.js';
import { clientFactory, controller, mountAsDsd, serverShadowHtml } from './_harness.js';

const CODE = '@code {\n  const { a, b, x, y } = props<{ a: boolean; b: boolean; x: string; y: string }>();\n}\n';

function graphOf(tag: string, template: string): ComponentGraph {
  return resolveComponents(
    '/page.fud',
    memoryIo({
      '/page.fud': `<link rel="component" href="./${tag}.fud">\n<html><head></head><body><${tag}></${tag}></body></html>\n`,
      [`/${tag}.fud`]: `${CODE}<${tag}>\n  <template shadowrootmode="open">${template}</template>\n</${tag}>\n`,
    }),
  );
}

interface State {
  readonly a: boolean;
  readonly b: boolean;
  readonly x: string;
  readonly y: string;
}

const values = (s: State): unknown[] => [s.a, s.b, s.x, s.y];
const payload = (s: State): unknown[] => [, , ...values(s)];

const STATES: readonly State[] = [
  { a: false, b: false, x: 'X', y: 'Y' },
  { a: true, b: false, x: '', y: 'Y' },
  { a: false, b: true, x: 'X', y: '' },
  { a: true, b: true, x: '', y: '' },
];

/** The shapes: static and dynamic texts on each side, chains, a front behind a block, rows. */
const SHAPES: readonly (readonly [string, string])[] = [
  ['static on both sides', '<p>Hola @if (a) {<b>!</b>} adios</p>'],
  ['dynamic in front', '<p>Hola @x @if (a) {<b>!</b>} adios</p>'],
  ['dynamic behind', '<p>Hola @if (a) {<b>!</b>} adios @y</p>'],
  ['dynamic on both sides', '<p>@x @if (a) {<b>!</b>} @y</p>'],
  ['three runs, two blocks', '<p>uno @x @if (a) {<b>A</b>} dos @if (b) {<i>B</i>} tres @y</p>'],
  ['two blocks between two runs', '<p>uno @x @if (a) {<b>A</b>}@if (b) {<i>B</i>} dos @y</p>'],
  ['a block in front of the chain', '<p>@if (b) {<i>B</i>} uno @x @if (a) {<b>A</b>} dos</p>'],
  ['elements around', '<div><span>s</span> uno @x @if (a) {<b>A</b>} dos <em>e</em></div>'],
  ['an @{ } between', '<p>uno @x @{ const z = 1; } dos @(y + z)</p>'],
  ['a loop between', '<p>uno @x @foreach (const n of (a ? [1, 2] : [])) key (n) {<b>@n</b>} dos @y</p>'],
  ['text inside the block too', '<p>uno @x @if (a) { en @y medio } dos</p>'],
  ['in a row', '<ul>@foreach (const n of (b ? [1, 2] : [3])) key (n) {<li>n@n @if (a) {<b>!</b>} fin @x</li>}</ul>'],
  ['as the roots of a block', '<p>@if (b) { uno @x @if (a) {<b>!</b>} dos @y }</p>'],
  ['a block that opens with text, after text', '<p>uno @x @if (a) { en @y }</p>'],
  ['a block that ends with text, before text', '<p><i>i</i>@if (a) { en @y } dos @x</p>'],
  ['two text blocks side by side', '<p>@if (a) { uno @x }@if (b) { dos @y }</p>'],
  ['rows of text', '<p>@foreach (const n of (a ? [1, 2] : [3])) key (n) { n @n }</p>'],
  ['rows of text between texts', '<p>uno @x @foreach (const n of (a ? [1, 2] : [3])) key (n) { n @n } dos</p>'],
];

function painted(g: ComponentGraph, tag: string, s: State): string {
  return mountAsDsd(tag, serverShadowHtml(g, tag, s)).shadow.innerHTML;
}

describe('text on both sides of a block', () => {
  SHAPES.forEach(([label, template], n) => {
    const tag = `x-tb-${n}`;
    const g = graphOf(tag, template);

    it(`${label}: hydrated, then updated, is what the server paints`, () => {
      for (const from of STATES) {
        for (const to of STATES) {
          const server = mountAsDsd(tag, serverShadowHtml(g, tag, from));
          const ctl = controller(clientFactory(g, tag), browserDom, server.shadow, values(from));
          ctl.h();
          ctl.u(payload(to));
          expect(server.shadow.innerHTML, `${JSON.stringify(from)} → ${JSON.stringify(to)}`).toBe(painted(g, tag, to));
        }
      }
    });

    it(`${label}: created, then updated, is what the server paints`, () => {
      for (const from of STATES) {
        for (const to of STATES) {
          const host = document.createElement(tag);
          const shadow = host.attachShadow({ mode: 'open' });
          document.body.append(host);
          const ctl = controller(clientFactory(g, tag), browserDom, shadow, values(from));
          ctl.c();
          expect(shadow.innerHTML, JSON.stringify(from)).toBe(painted(g, tag, from));
          ctl.u(payload(to));
          expect(shadow.innerHTML, `${JSON.stringify(from)} → ${JSON.stringify(to)}`).toBe(painted(g, tag, to));
        }
      }
    });
  });

  it('the server paints one comment after each run that a block separates from the next', () => {
    const g = graphOf('x-tb-count', '<p>uno @if (a) {<b>A</b>} dos @if (b) {<i>B</i>} tres</p>');
    expect(serverShadowHtml(g, 'x-tb-count', STATES[0])).toContain('<p>uno <!----> dos <!----> tres</p>');
  });

  it('and none where an element already separates them', () => {
    const g = graphOf('x-tb-none', '<p>uno <i>i</i>@if (a) {<b>A</b>} dos</p>');
    expect(serverShadowHtml(g, 'x-tb-none', STATES[0])).not.toContain('<!---->');
  });
});
