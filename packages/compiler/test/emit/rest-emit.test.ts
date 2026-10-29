// @vitest-environment happy-dom
/**
 * The rest of `props<T>()` on both sides — what the emit writes and what it does when run.
 *
 * The server keeps `...resto` in the pattern and slices each gathered key into the state; the
 * client takes each key into a hidden `$o_` local, assembles the rest object on declaration and
 * rebuilds it after the update guards. Then the three readers that ask "which names does this
 * component's code have": the level rule (the rest object moves), the reactive scope and the
 * crossing names (a gathered key is nobody's name).
 */

import { describe, expect, it } from 'vitest';
import { browserDom } from '@fudic/dom';
import { signal } from '@fudic/core';
import {
  resolveComponents,
  resolveDocument,
  emitComponentClientModuleMapped,
  emitComponentModule,
  emitLayoutModule,
  emitRouteModule,
  hydratableTags,
  contractDiagnostics,
  type ComponentGraph,
} from '../../src/emit/index.js';
import { reactiveScope } from '../../src/emit/state.js';
import { drain, memoryIo, minimalSsr, type Pieces } from './_support.js';
import { clientFactory, controller, mountAsDsd, serverShadowHtml } from './hydrate/_harness.js';

const CAMPO =
  '@code {\n' +
  '  const { label, ...resto } = props<{ label: string; placeholder?: string; required?: boolean; maxlength?: number }>();\n' +
  '}\n' +
  '<x-campo>\n  <template shadowrootmode="open">' +
  '<span class="label">@label</span><input placeholder=@resto.placeholder>' +
  '<p class="eco">@resto.placeholder · @(String(resto.required)) · @(String(resto.maxlength))</p>' +
  '</template>\n</x-campo>\n';

function graphOf(files: Record<string, string>, entry: string): ComponentGraph {
  return resolveComponents(
    '/page.fud',
    memoryIo({
      '/page.fud': `<link rel="component" href="./${entry}.fud">\n<html><head></head><body><${entry}></${entry}></body></html>\n`,
      ...files,
    }),
  );
}

describe('the server', () => {
  const graph = graphOf({ '/x-campo.fud': CAMPO }, 'x-campo');
  const server = emitComponentModule(graph, graph.components.get('x-campo')!);

  it('keeps the rest in the pattern and slices each gathered key into the state', () => {
    expect(server).toContain('const { label, ...resto } = props ?? {};');
    expect(server).toContain('$dom.state($shadow, [label, resto.placeholder, resto.required, resto.maxlength]);');
  });

  it('paints what the rest gathered', () => {
    const html = serverShadowHtml(graph, 'x-campo', { label: 'Nombre', placeholder: 'Escribe tu nombre', required: true, maxlength: 20 });
    expect(html).toBe(
      '<span class="label">Nombre</span><input placeholder="Escribe tu nombre">' +
        '<p class="eco">Escribe tu nombre · true · 20</p>',
    );
  });

  it('a layout keeps the rest in its pattern too', async () => {
    const layout =
      '<!DOCTYPE html>\n<html lang="es">\n  <head>\n  @code {\n  const { culture, ...resto } = props<{ culture: string; theme?: string }>();\n}\n  @RenderHead()\n  </head>\n' +
      '  <body data-theme="@resto.theme">@RenderBody()</body>\n</html>\n';
    const graph = resolveDocument(
      '/app/index.fud',
      memoryIo({ '/app/index.fud': '<link rel="layout" href="./_layout.fud"><p>hola</p>', '/app/_layout.fud': layout }),
    ).value;
    const code = emitLayoutModule(graph, graph.layouts[0]!);
    expect(code).toContain('const { culture, ...resto } = $props ?? {};');

    const evaluate = (text: string, bindings: Record<string, unknown>, returns: string): unknown =>
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      new Function(...Object.keys(bindings), text.replace(/^import[^\n]*\n/gmu, '').replace(/^export\s+/gmu, '') + `\nreturn ${returns};`)(
        ...Object.values(bindings),
      );
    const page = evaluate(emitRouteModule(graph), { layout: evaluate(code, {}, 'layout') }, 'page') as (
      d: unknown,
      io: unknown,
      ioc: unknown,
      props: unknown,
    ) => Pieces;
    const html = await drain(page({}, { ...minimalSsr(), nonce: '' }, undefined, { culture: 'es', theme: 'oscuro' }));
    expect(html).toContain('data-theme="oscuro"');
  });
});

describe('the client text', () => {
  const graph = graphOf({ '/x-campo.fud': CAMPO }, 'x-campo');
  const client = emitComponentClientModuleMapped(graph, graph.components.get('x-campo')!).code;

  it('takes each gathered key into a $o_ local and assembles the rest on declaration', () => {
    expect(client).toContain(
      'let [$dom, $shadow, label, $o_placeholder, $o_required, $o_maxlength] = $props; ' +
        'let resto = { "placeholder": $o_placeholder, "required": $o_required, "maxlength": $o_maxlength };',
    );
  });

  it('rebuilds the rest after the guards, before the view re-applies', () => {
    expect(client).toContain(
      'u: ($p) => { if (2 in $p) label = $p[2]; if (3 in $p) $o_placeholder = $p[3]; if (4 in $p) $o_required = $p[4]; ' +
        'if (5 in $p) $o_maxlength = $p[5]; resto = { "placeholder": $o_placeholder, "required": $o_required, "maxlength": $o_maxlength }; $a(); },',
    );
  });
});

describe('run over a live DOM', () => {
  const graph = graphOf({ '/x-campo.fud': CAMPO }, 'x-campo');
  const values = ['Nombre', 'Escribe tu nombre', true, 20] as const;
  const props = { label: 'Nombre', placeholder: 'Escribe tu nombre', required: true, maxlength: 20 };

  it('create paints the tree the server painted', () => {
    const host = document.createElement('x-campo');
    const shadow = host.attachShadow({ mode: 'open' });
    document.body.append(host);
    controller(clientFactory(graph, 'x-campo'), browserDom, shadow, values).c();
    expect(shadow.innerHTML).toBe(mountAsDsd('x-campo', serverShadowHtml(graph, 'x-campo', props)).shadow.innerHTML);
  });

  it('after hydrate, a gathered key that changes updates resto.x in the view; a named one stays', () => {
    const { shadow } = mountAsDsd('x-campo', serverShadowHtml(graph, 'x-campo', props));
    const ctl = controller(clientFactory(graph, 'x-campo'), browserDom, shadow, values);
    ctl.h();

    ctl.u!([, , , '¿Cómo te llamas?', false]);
    expect(shadow.querySelector('input')!.getAttribute('placeholder')).toBe('¿Cómo te llamas?');
    expect(shadow.querySelector('.eco')!.textContent).toBe('¿Cómo te llamas? · false · 20');
    expect(shadow.querySelector('.label')!.textContent).toBe('Nombre');

    ctl.u!([, , 'Apellido']);
    expect(shadow.querySelector('.label')!.textContent).toBe('Apellido');
    expect(shadow.querySelector('.eco')!.textContent).toBe('¿Cómo te llamas? · false · 20');
  });

  it('r() tears down without throwing', () => {
    const { shadow } = mountAsDsd('x-campo', serverShadowHtml(graph, 'x-campo', props));
    const ctl = controller(clientFactory(graph, 'x-campo'), browserDom, shadow, values);
    ctl.h();
    expect(() => ctl.r!()).not.toThrow();
  });

  it('a gathered Signal<T> key repaints when the parent sets it, as a named one does', () => {
    const SIG = '@code {\n  const { ...resto } = props<{ v: Signal<number> }>();\n}\n<x-sig>\n  <template shadowrootmode="open"><p>@resto.v()</p></template>\n</x-sig>\n';
    const g = graphOf({ '/x-sig.fud': SIG }, 'x-sig');
    const v = signal(1);
    const host = document.createElement('x-sig');
    const shadow = host.attachShadow({ mode: 'open' });
    document.body.append(host);
    controller(clientFactory(g, 'x-sig'), browserDom, shadow, [v]).c();
    expect(shadow.querySelector('p')!.textContent).toBe('1');
    v.set(2);
    expect(shadow.querySelector('p')!.textContent).toBe('2');
  });
});

describe('the names of the component´s code', () => {
  const KID = '@code {\n  const { a = "" } = props<{ a?: string }>();\n}\n<x-kid>\n  <template shadowrootmode="open"><b>@a</b></template>\n</x-kid>\n';

  it('level: the rest object moves, so a child fed from it hydrates', () => {
    const PAR =
      '<link rel="component" href="./x-kid.fud">\n' +
      '@code {\n  const { ...resto } = props<{ x?: string }>();\n  function go() {}\n}\n' +
      '<x-par>\n  <template shadowrootmode="open"><x-kid .a=@resto.x></x-kid><button @click=@go>go</button></template>\n</x-par>\n';
    const graph = graphOf({ '/x-par.fud': PAR, '/x-kid.fud': KID }, 'x-par');
    expect([...hydratableTags(graph)].sort()).toEqual(['x-kid', 'x-par']);
  });

  it('reactive scope: a gathered Signal key is no name of the code; a named one is', () => {
    const SIG =
      '@code {\n  const { n, ...resto } = props<{ n: Signal<number>; v: Signal<number> }>();\n}\n' +
      '<x-sig>\n  <template shadowrootmode="open"><p>@n()</p></template>\n</x-sig>\n';
    const graph = graphOf({ '/x-sig.fud': SIG }, 'x-sig');
    const scope = reactiveScope(graph.components.get('x-sig')!);
    expect(scope.has('n')).toBe(true);
    expect(scope.has('v')).toBe(false);
  });

  it('crossing names: a gathered key cannot be forwarded by its bare name', () => {
    const SIGKID =
      '@code {\n  const { v } = props<{ v: Signal<number> }>();\n}\n<x-kid>\n  <template shadowrootmode="open"><b>@v()</b></template>\n</x-kid>\n';
    const par = (pattern: string): string =>
      '<link rel="component" href="./x-kid.fud">\n' +
      `@code {\n  const { ${pattern} } = props<{ v: Signal<number> }>();\n}\n` +
      '<x-par>\n  <template shadowrootmode="open"><x-kid .v=@v></x-kid></template>\n</x-par>\n';
    const codes = (pattern: string): readonly string[] => {
      const graph = resolveComponents(
        '/x-par.fud',
        memoryIo({ '/x-par.fud': par(pattern), '/x-kid.fud': SIGKID }),
      );
      return contractDiagnostics(graph).map((d) => d.code);
    };
    // Named: `v` IS a signal of this component, so the channel is satisfied — what is left is
    // only that this `x-kid` does not hydrate (FUD0202). Gathered: there is no `v` in this code
    // to cross by reference, and the channel rule says so first (FUD0200).
    expect(codes('v')).toEqual(['FUD0202']);
    expect(codes('...resto')).toEqual(['FUD0200']);
  });
});
