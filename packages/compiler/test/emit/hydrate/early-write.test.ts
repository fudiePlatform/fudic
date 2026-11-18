// @vitest-environment happy-dom
/**
 * SDD-86 (framework bug found by the /ciclo e2e) — a block's source written BEFORE `h`.
 *
 * The server painted the block with the value it saw. In the browser something writes the
 * source before the instance adopts — its own `effect`, or, on /ciclo, the lifecycle hooks of
 * the children, which hydrate first and write a shared store the parent's `@foreach` reads.
 * Adoption must walk what the server painted; the hookup then repaints to the live value.
 */
import { it, expect } from 'vitest';
import type { FudicElement } from '@fudic/core';
import { resolveComponents } from '../../../src/emit/index.js';
import { memoryIo } from '../_support.js';
import { clientFactory, mountAsDsd, serverShadowHtml } from './_harness.js';
it('a keyed @foreach whose signal was written by an effect before h adopts the empty list, then shows the item', () => {
  const tag = 'zz-early';
  const g = resolveComponents('/p.fud', memoryIo({
    '/p.fud': `<link rel="component" href="./c.fud">\n<html><head></head><body><${tag}></${tag}></body></html>\n`,
    '/c.fud': `@code {\nconst items = signal([]);\neffect(() => { items.set([{ id: 1, t: 'a' }]); });\n}\n<${tag}>\n<template shadowrootmode="open"><ol>@foreach (const it of items()) key (it.id) { <li>@it.t</li> }</ol></template>\n</${tag}>\n`,
  }));
  customElements.define(tag, clientFactory(g, tag) as unknown as CustomElementConstructor);
  const { host } = mountAsDsd(tag, serverShadowHtml(g, tag, {}));
  expect(host.shadowRoot!.querySelectorAll('li').length).toBe(0);
  (host as FudicElement).h([]);
  expect(host.shadowRoot!.querySelectorAll('li').length).toBe(1);
});

it('an @if whose signal was written by an effect before h adopts the painted branch, then switches', () => {
  const tag = 'zz-early-if';
  const g = resolveComponents('/p.fud', memoryIo({
    '/p.fud': `<link rel="component" href="./c.fud">\n<html><head></head><body><${tag}></${tag}></body></html>\n`,
    '/c.fud': `@code {\nconst open = signal(false);\neffect(() => { open.set(true); });\n}\n<${tag}>\n<template shadowrootmode="open"><div>@if (open()) { <p class="yes">yes</p> } else { <span class="no">no</span> }</div></template>\n</${tag}>\n`,
  }));
  customElements.define(tag, clientFactory(g, tag) as unknown as CustomElementConstructor);
  const { host } = mountAsDsd(tag, serverShadowHtml(g, tag, {}));
  expect(host.shadowRoot!.querySelector('.no')).not.toBeNull();
  (host as FudicElement).h([]);
  expect(host.shadowRoot!.querySelector('.yes')).not.toBeNull();
  expect(host.shadowRoot!.querySelector('.no')).toBeNull();
});
