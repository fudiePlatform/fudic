// @vitest-environment happy-dom
/**
 * SDD-80 §8.2.34 and §8.2.35 — what a view reads THROUGH an imported name repaints it, at the
 * root and inside a block, values and the conditions of constructs alike.
 *
 * An imported form is an object whose members are sources; the name itself is not one, so
 * `$subIf(f, $u)` hears nothing. «Comprobando…» never showed on leaving a field because the
 * `@if (userForm.alias.pending())` it sat in only woke when a VALUE of the form moved. Here
 * `f` stands for such a form: a plain object of signals, injected where the chunk imports it,
 * and only its members move — no prop, no signal of the component — so a repaint can only come
 * from a watched read.
 */

import { describe, expect, it } from 'vitest';
import { FudicElement, computed, effect, live, owned, signal, subscribe, subscribeIf, written, type FudicElementCtor } from '@fudic/core';
import { browserDom, emit } from '@fudic/dom';
import { emitComponentClientModule, resolveComponents } from '../../../src/emit/index.js';
import { memoryIo } from '../_support.js';

const VIEW =
  '@code {\n' +
  "  import { signal } from '@fudic/core';\n" +
  "  import { f } from './store.js';\n" +
  '  const rows = signal(["a", "b"]);\n' +
  '}\n' +
  '<x-reads>\n' +
  '  <template shadowrootmode="open">' +
  '<p class="top">@if (f.flag()) {<b>on</b>} else {<b>off</b>}</p>' +
  '<ul>@foreach (const r of rows()) key (r) {' +
  '<li>@r:@(f.label())@if (f.flag()) {<i>!</i>}@switch (f.label()) { case "z": <u>z</u> }</li>' +
  '}</ul>' +
  '<ol>@foreach (const n of f.items()) key (n) {<li>@n</li>}</ol>' +
  '</template>\n' +
  '</x-reads>\n';

/** The chunk, evaluated with `f` and the runtime injected where it imports them. */
function created(): { shadow: ShadowRoot; f: { flag: ReturnType<typeof signal<boolean>>; label: ReturnType<typeof signal<string>>; items: ReturnType<typeof signal<string[]>> } } {
  const graph = resolveComponents(
    '/page.fud',
    memoryIo({
      '/page.fud': '<link rel="component" href="./x-reads.fud">\n<html><head></head><body><x-reads></x-reads></body></html>\n',
      '/x-reads.fud': VIEW,
      '/store.js': 'export const f = {};\n',
    }),
  );
  const source = emitComponentClientModule(graph, graph.components.get('x-reads')!);
  const f = { flag: signal(false), label: signal('x'), items: signal(['1']) };
  let ctor: FudicElementCtor | undefined;
  const registry = { define: (_: string, c: FudicElementCtor) => void (ctor = c) };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function(
    'FudicElement', 'signal', 'computed', 'effect', '$sub', '$subIf', '$written', '$live', '$owned', 'emit', 'customElements', 'f',
    source.replace(/^import .*$/gmu, ''),
  )(FudicElement, signal, computed, effect, subscribe, subscribeIf, written, live, owned, emit, registry, f);
  const host = document.createElement('x-reads');
  const shadow = host.attachShadow({ mode: 'open' });
  document.body.append(host);
  ctor!.c([browserDom, shadow]).c();
  return { shadow, f };
}

const text = (root: ParentNode, selector: string): string => root.querySelector(selector)!.textContent.replace(/\s/gu, '');

describe('reads through an imported name (SDD-80 §8.2.34, §8.2.35)', () => {
  it('an `@if` at the root follows a member of the import', () => {
    const { shadow, f } = created();
    expect(text(shadow, '.top')).toBe('off');
    f.flag.set(true);
    expect(text(shadow, '.top')).toBe('on');
  });

  it('inside a row: a value, an `@if` and a `@switch` follow it, each row with its own name', () => {
    const { shadow, f } = created();
    expect(text(shadow, 'ul')).toBe('a:xb:x');
    f.label.set('z');
    expect(text(shadow, 'ul')).toBe('a:zzb:zz');
    f.flag.set(true);
    expect(text(shadow, 'ul')).toBe('a:z!zb:z!z');
  });

  it('a `@foreach` whose source is a member of the import follows it', () => {
    const { shadow, f } = created();
    expect(text(shadow, 'ol')).toBe('1');
    f.items.set(['1', '2']);
    expect(text(shadow, 'ol')).toBe('12');
  });
});
