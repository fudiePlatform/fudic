// @vitest-environment happy-dom
/**
 * `<input ...resto>` — a spread on a NATIVE element writes attributes (`Dom.setAttrs`).
 *
 * The text nets check the codegen: one `setAttrs` of all the objects, the element's own
 * attributes (and the `class` a `class:` composes) in the except list, the server writing once
 * with no previous, the client keeping what it wrote last in the guard and `h` seeding it with
 * what the server painted. The run nets check what that is for: SSR and `c` paint the same,
 * and after hydrating, an update takes off an attribute the SERVER painted — the one case a
 * guard seeded with nothing would get wrong.
 */

import { describe, expect, it } from 'vitest';
import { browserDom } from '@fudic/dom';
import {
  resolveComponents,
  emitComponentClientModuleMapped,
  emitComponentModule,
  type ComponentGraph,
} from '../../src/emit/index.js';
import { spreadTarget } from '../../src/semantic/analyzers/spread-target.js';
import type { Diagnostic } from '../../src/types/index.js';
import { memoryIo } from './_support.js';
import { clientFactory, controller, mountAsDsd, serverShadowHtml } from './hydrate/_harness.js';
import { viewInput } from '../semantic/_view.js';

const FIELD =
  '@code {\n' +
  '  const { items = [], ...resto } = props<{ items?: { id: string; title?: string }[]; placeholder?: string; required?: boolean; maxlength?: number }>();\n' +
  '}\n' +
  '<x-field>\n  <template shadowrootmode="open">' +
  '<input class="a" ...resto>' +
  '<input class="b" ...resto placeholder="mío">' +
  '@if (resto.required) {<b class="req" ...resto></b>}' +
  '<ul>@foreach (const x of items) key (x.id) {<li ...x></li>}</ul>' +
  '</template>\n</x-field>\n';

function graphOf(tag: string, source: string): ComponentGraph {
  return resolveComponents(
    '/page.fud',
    memoryIo({
      '/page.fud': `<link rel="component" href="./${tag}.fud">\n<html><head></head><body><${tag}></${tag}></body></html>\n`,
      [`/${tag}.fud`]: source,
    }),
  );
}

describe('the emitted text', () => {
  const graph = graphOf('x-field', FIELD);
  const server = emitComponentModule(graph, graph.components.get('x-field')!);
  const client = emitComponentClientModuleMapped(graph, graph.components.get('x-field')!).code;

  it('the server writes the objects once, with no previous, the explicit names excepted', () => {
    expect(server).toMatch(/\$dom\.setAttrs\(\$n\d+, \[\(resto\)\], undefined, \["class"\]\);/u);
    expect(server).toMatch(/\$dom\.setAttrs\(\$n\d+, \[\(resto\)\], undefined, \["class","placeholder"\]\);/u);
    expect(server).toMatch(/\$dom\.setAttrs\(\$n\d+, \[\(x\)\], undefined, \[\]\);/u);
  });

  it('the client keeps what it wrote last and hands it over as the previous', () => {
    expect(client).toMatch(
      /if \(\$v !== \$w\[(\d+)\]\) \{ const \$o = \$w\[\1\]; \$w\[\1\] = \$v; \$dom\.setAttrs\(\$n\d+, \$v, \$o, \["class"\]\); \}/u,
    );
  });

  it('h seeds the guard with the objects the server painted from, in a block too', () => {
    const h = client.slice(client.lastIndexOf('h: () => {'));
    expect(h).toMatch(/\$w\[\d+\] = \[\(resto\)\];/u);
    expect(client).toMatch(/h: \(\$c\) => \{\n\s*\$w\[0\] = \[\(x\)\];/u);
  });

  it('a class: composition puts `class` in the except list', () => {
    const g = graphOf('x-cls', '@code {\n  const { ...r } = props<{ k?: boolean }>();\n}\n<x-cls>\n  <template shadowrootmode="open"><p class:on=@r.k ...r></p></template>\n</x-cls>\n');
    expect(emitComponentModule(g, g.components.get('x-cls')!)).toContain('["class"]);');
  });

  it('a spread on a component host hands props over and writes no attribute', () => {
    const KID = '@code {\n  const { a = "" } = props<{ a?: string }>();\n}\n<x-kid>\n  <template shadowrootmode="open"><i>@a</i></template>\n</x-kid>\n';
    const PAR = '<link rel="component" href="./x-kid.fud">\n@code {\n  const o = { a: "1" };\n}\n<x-par>\n  <template shadowrootmode="open"><x-kid ...o></x-kid></template>\n</x-par>\n';
    const g = resolveComponents(
      '/page.fud',
      memoryIo({
        '/page.fud': '<link rel="component" href="./x-par.fud">\n<html><head></head><body><x-par></x-par></body></html>\n',
        '/x-par.fud': PAR,
        '/x-kid.fud': KID,
      }),
    );
    expect(emitComponentModule(g, g.components.get('x-par')!)).not.toContain('setAttrs');
  });
});

describe('run over a live DOM', () => {
  const graph = graphOf('x-run-field', FIELD.replaceAll('x-field', 'x-run-field'));
  const items = [{ id: 'a', title: 'A' }];
  const props = { items, placeholder: 'Escribe', required: true, maxlength: 20 };
  const values = [items, 'Escribe', true, 20] as const;

  const painted = (): ShadowRoot => mountAsDsd('x-run-field', serverShadowHtml(graph, 'x-run-field', props)).shadow;

  it('the server and create paint the same attributes; the explicit one wins either side', () => {
    const host = document.createElement('x-run-field');
    const shadow = host.attachShadow({ mode: 'open' });
    document.body.append(host);
    controller(clientFactory(graph, 'x-run-field'), browserDom, shadow, values).c();
    expect(shadow.innerHTML).toBe(painted().innerHTML);
    expect(shadow.querySelector('input.a')!.getAttribute('placeholder')).toBe('Escribe');
    expect(shadow.querySelector('input.a')!.getAttribute('required')).toBe('');
    expect(shadow.querySelector('input.a')!.getAttribute('maxlength')).toBe('20');
    expect(shadow.querySelector('input.b')!.getAttribute('placeholder')).toBe('mío');
    expect(shadow.querySelector('li')!.getAttribute('title')).toBe('A');
  });

  it('after hydrate, required=false TAKES OFF the attribute the server painted', () => {
    const shadow = painted();
    const ctl = controller(clientFactory(graph, 'x-run-field'), browserDom, shadow, values);
    ctl.h();
    const input = shadow.querySelector('input.a')!;
    expect(input.hasAttribute('required')).toBe(true);

    ctl.u!([, , , '¿Cómo te llamas?', false]);
    expect(input.hasAttribute('required')).toBe(false);
    expect(input.getAttribute('placeholder')).toBe('¿Cómo te llamas?');
    expect(input.getAttribute('maxlength')).toBe('20');
    // The explicit attribute is never the spread's, before or after.
    expect(shadow.querySelector('input.b')!.getAttribute('placeholder')).toBe('mío');
    expect(shadow.querySelector('input.b')!.hasAttribute('required')).toBe(false);
    // The @if left with `required`.
    expect(shadow.querySelector('b.req')).toBeNull();

    ctl.u!([, , , 'Escribe', true]);
    expect(input.getAttribute('required')).toBe('');
    expect(shadow.querySelector('b.req')!.getAttribute('placeholder')).toBe('Escribe');
  });

  it('inside a @foreach: a row that changed takes off and puts on its own attributes', () => {
    const shadow = painted();
    const ctl = controller(clientFactory(graph, 'x-run-field'), browserDom, shadow, values);
    ctl.h();
    const li = shadow.querySelector('li')!;
    expect(li.getAttribute('title')).toBe('A');

    ctl.u!([, , [{ id: 'a' }]]);
    expect(shadow.querySelector('li')).toBe(li);
    expect(li.hasAttribute('title')).toBe(false);
    expect(li.getAttribute('id')).toBe('a');
  });
});

describe('FUD0992 — only the component´s own wrapper and its shadow template', () => {
  function reported(source: string): readonly string[] {
    const out: Diagnostic[] = [];
    spreadTarget.run(viewInput(source), (d) => out.push(d));
    return out.map((d) => `${d.code} ${source.slice(d.span.start, d.span.end)}`);
  }

  it('on the host wrapper and on the template', () => {
    const source = '@code {\n  const o = {};\n}\n<x-a ...o><template shadowrootmode="open" ...o><p>x</p></template></x-a>\n';
    expect(reported(source)).toEqual(['FUD0992 ...o', 'FUD0992 ...o']);
  });

  it('not on a native element, an SVG one or a component', () => {
    const source =
      '@code {\n  const o = {};\n}\n<x-a><template shadowrootmode="open">' +
      '<input ...o><svg ...o><circle ...o></circle></svg><x-card ...o></x-card></template></x-a>\n';
    expect(reported(source)).toEqual([]);
  });

  it('nothing to report outside a component file', () => {
    expect(reported('<link rel="layout" href="./_layout.fud">\n<input ...o>\n')).toEqual([]);
  });
});
