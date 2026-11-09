// @vitest-environment happy-dom
/**
 * SDD-80 §8.2.36 — two constructs side by side keep the order of the source when the FIRST one
 * renders after the second already did.
 *
 * A construct used to be transparent as an anchor: the blocks of a run of constructs shared the
 * node behind them, and the order between them was the order they were inserted in. An `@if`
 * that turned on after the `@switch` behind it had rendered landed after it — a tree the server
 * never paints. Now an update inserts before where the next construct that renders begins.
 */

import { describe, expect, it } from 'vitest';
import { browserDom } from '@fudic/dom';
import { resolveComponents } from '../../../src/emit/index.js';
import { memoryIo } from '../_support.js';
import { clientFactory, controller } from './_harness.js';

/** A component of `on` and `rows` over `template`, created; `set` hands it new props. */
function created(tag: string, template: string): { html: () => string; set: (on: boolean, rows: string[]) => void } {
  const source =
    '@code {\n  const { on, rows } = props<{ on: boolean; rows: string[] }>();\n}\n' +
    `<${tag}>\n  <template shadowrootmode="open">${template}</template>\n</${tag}>\n`;
  const graph = resolveComponents(
    '/page.fud',
    memoryIo({
      '/page.fud': `<link rel="component" href="./${tag}.fud">\n<html><head></head><body><${tag}></${tag}></body></html>\n`,
      [`/${tag}.fud`]: source,
    }),
  );
  const host = document.createElement(tag);
  const shadow = host.attachShadow({ mode: 'open' });
  document.body.append(host);
  const ctl = controller(clientFactory(graph, tag), browserDom, shadow, [false, ['a']]);
  ctl.c();
  return { html: () => shadow.innerHTML.replace(/\s/gu, ''), set: (on, rows) => ctl.u([, , on, rows]) };
}

describe('constructs side by side (SDD-80 §8.2.36)', () => {
  it('an `@if` that turns on lands ahead of the `@switch` behind it', () => {
    const view = created('x-adj-a', '<p>@if (on) {<i>!</i>}@switch (1) { case 1: <u>z</u> }</p>');
    expect(view.html()).toBe('<p><u>z</u></p>');
    view.set(true, ['a']);
    expect(view.html()).toBe('<p><i>!</i><u>z</u></p>');
  });

  it('inside a row too', () => {
    const view = created('x-adj-b', '<ul>@foreach (const r of rows) key (r) {<li><b>@r</b>@if (on) {<i>!</i>}@switch (1) { case 1: <u>z</u> }</li>}</ul>');
    view.set(true, ['a']);
    expect(view.html()).toBe('<ul><li><b>a</b><i>!</i><u>z</u></li></ul>');
  });

  it('a loop that grows stays ahead of the `@if` behind it, and skips one that renders nothing', () => {
    const view = created(
      'x-adj-c',
      '<p>@foreach (const r of rows) key (r) {<b>@r</b>}@if (!on) {<s>-</s>}@if (on) {<i>!</i>}</p>',
    );
    view.set(true, ['a']);
    expect(view.html()).toBe('<p><b>a</b><i>!</i></p>');
    view.set(true, ['a', 'b']);
    expect(view.html()).toBe('<p><b>a</b><b>b</b><i>!</i></p>');
  });

  it('at the root of the template, where the blocks are mounted late', () => {
    const view = created('x-adj-d', '@if (on) {<i>!</i>}@switch (1) { case 1: <u>z</u> }<hr>');
    expect(view.html()).toBe('<u>z</u><hr>');
    view.set(true, ['a']);
    expect(view.html()).toBe('<i>!</i><u>z</u><hr>');
  });
});
