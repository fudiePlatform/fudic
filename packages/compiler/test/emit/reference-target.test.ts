/**
 * BUG-42 §6.C, criterion 21 — the bridge of a control-component (decision 132).
 *
 * The AUTHOR writes `shadowrootreferencetarget`; the compiler never chooses a field for them.
 * With it, the server writes the attribute on the template of the host its PARENT opens, and the
 * child's class carries the same id as `static field`, which `FudicControlElement` turns into the
 * `referenceTarget` of its `attachShadow` and the element it relays to. Without it, there is no
 * bridge and nothing is relayed.
 */

import { describe, expect, it } from 'vitest';
import { SsrDom, renderToString } from '@fudic/ssr';
import {
  bridgeIds,
  emitComponentClientModule,
  emitComponentModule,
  resolveComponents,
  type ComponentGraph,
} from '../../src/emit/index.js';
import { bridgeOf } from '../../src/binding/index.js';
import { memoryIo } from './_support.js';

/** A page hosting `<app-input>` inside `<m-el>`, with the child's template as given. */
function graphWith(template: string): ComponentGraph {
  return resolveComponents(
    '/home.fud',
    memoryIo({
      '/home.fud':
        '<!DOCTYPE html>\n<html><head><link rel="component" href="./m.fud"></head><body></body></html>',
      '/m.fud':
        '<link rel="component" href="./app-input.fud">\n' +
        "@code {\n  import { f } from './user.form.js';\n}\n" +
        '<m-el>\n  <template shadowrootmode="open"><form control="@f"><app-input control="@f.alias"></app-input></form></template>\n</m-el>\n',
      '/app-input.fud':
        '@code {\n  const { ctrl } = props<{ ctrl?: unknown }>();\n}\n' +
        `<app-input>\n  ${template}\n</app-input>\n`,
    }),
  );
}

const child = (graph: ComponentGraph) => graph.components.get('app-input')!;

describe('the bridge (criterion 21)', () => {
  it('points at the id the author named, on both ends', () => {
    const graph = graphWith(
      '<template shadowrootmode="open" formassociated shadowrootreferencetarget="campo">' +
        '<div><input id="campo" control="@ctrl"></div></template>',
    );
    expect(bridgeIds(graph).get('app-input')).toBe('campo');
    const parent = emitComponentModule(graph, graph.components.get('m-el')!);
    expect(parent).toMatch(/\$dom\.attachShadow\(\$n\d+, true, "campo"\)/u);
    expect(emitComponentClientModule(graph, child(graph))).toContain('static field = "campo";');
  });

  it('any element of the template: the author decides what the bridge reaches', () => {
    const graph = graphWith(
      '<template shadowrootmode="open" formassociated shadowrootreferencetarget="otro">' +
        '<input id="campo" control="@ctrl"><span id="otro"></span></template>',
    );
    expect(bridgeIds(graph).get('app-input')).toBe('otro');
    expect(emitComponentClientModule(graph, child(graph))).toContain('static field = "otro";');
  });

  it('without the attribute there is no bridge, and the compiler invents none', () => {
    const graph = graphWith('<template shadowrootmode="open" formassociated><input control="@ctrl"></template>');
    expect(bridgeIds(graph).has('app-input')).toBe(false);
    const parent = emitComponentModule(graph, graph.components.get('m-el')!);
    expect(parent).toMatch(/\$dom\.attachShadow\(\$n\d+, true\);/u);
    const server = emitComponentModule(graph, child(graph));
    const client = emitComponentClientModule(graph, child(graph));
    expect(client).not.toContain('static field');
    // No id written on the field either: nothing names it.
    for (const out of [server, client]) expect(out).not.toContain(`'id', `);
  });

  it('serializes on the template the parent opens', () => {
    const dom = new SsrDom();
    const host = dom.element('app-input');
    dom.attachShadow(host, true, 'campo');
    expect(renderToString(host)).toContain(
      '<template shadowrootmode="open" shadowrootdelegatesfocus shadowrootreferencetarget="campo">',
    );
  });

  it('a component that is not a control-component has none', () => {
    const graph = graphWith(
      '<template shadowrootmode="open" shadowrootreferencetarget="campo"><input id="campo" control="@ctrl"></template>',
    );
    expect(bridgeIds(graph).has('app-input')).toBe(false);
    expect(emitComponentClientModule(graph, child(graph))).not.toContain('static field');
    expect(bridgeOf(child(graph).doc.template!)).toEqual({ bridge: null, problems: [] });
  });
});
