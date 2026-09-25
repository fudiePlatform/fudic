/**
 * BUG-42 §6.C, criterion 21 — the bridge of a control-component (decision 132).
 *
 * The server writes `shadowrootreferencetarget` on the template of the host its PARENT opens,
 * and the child's class carries the same id as `static field`, which `FudicControlElement` turns
 * into the `referenceTarget` of its `attachShadow`. The field gets the derived id when its author
 * wrote none, and a target written by hand is respected.
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
import { bridgeOf, DERIVED_FIELD_ID } from '../../src/binding/index.js';
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
  it('points at the id the author gave the field, on both ends', () => {
    const graph = graphWith(
      '<template shadowrootmode="open" formassociated><div><input id="campo" control="@ctrl"></div></template>',
    );
    expect(bridgeIds(graph).get('app-input')).toBe('campo');
    const parent = emitComponentModule(graph, graph.components.get('m-el')!);
    expect(parent).toMatch(/\$dom\.attachShadow\(\$n\d+, true, "campo"\)/u);
    const client = emitComponentClientModule(graph, child(graph));
    expect(client).toContain('static field = "campo";');
    // The field keeps the author's id, and the compiler writes none.
    expect(emitComponentModule(graph, child(graph))).not.toContain(`'id', "fud-field"`);
  });

  it('gives the field the derived id when its author wrote none', () => {
    const graph = graphWith('<template shadowrootmode="open" formassociated><input control="@ctrl"></template>');
    const server = emitComponentModule(graph, child(graph));
    const client = emitComponentClientModule(graph, child(graph));
    for (const out of [server, client]) expect(out).toContain(`'id', "${DERIVED_FIELD_ID}"`);
    expect(client).toContain(`static field = "${DERIVED_FIELD_ID}";`);
  });

  it('the radios of a group are bridged through their container', () => {
    const graph = graphWith(
      '<template shadowrootmode="open" formassociated><fieldset><input type="radio" control="@ctrl"></fieldset></template>',
    );
    const server = emitComponentModule(graph, child(graph));
    expect(server).toMatch(/\$n0 = \$dom\.element\("fieldset"\);\s+\$dom\.setAttr\(\$n0, 'id', "fud-field"\);/u);
  });

  it('respects a target written by hand', () => {
    const graph = graphWith(
      '<template shadowrootmode="open" formassociated shadowrootreferencetarget="otro">' +
        '<input id="campo" control="@ctrl"><span id="otro"></span></template>',
    );
    expect(bridgeIds(graph).get('app-input')).toBe('otro');
    expect(emitComponentClientModule(graph, child(graph))).toContain('static field = "otro";');
  });

  it('serializes on the template the parent opens', () => {
    const dom = new SsrDom();
    const host = dom.element('app-input');
    dom.attachShadow(host, true, 'campo');
    expect(renderToString(host)).toContain(
      '<template shadowrootmode="open" shadowrootdelegatesfocus shadowrootreferencetarget="campo">',
    );
  });

  it('a control-component that binds nothing delegates focus and has no bridge', () => {
    const graph = graphWith('<template shadowrootmode="open" formassociated><p></p></template>');
    expect(bridgeIds(graph).has('app-input')).toBe(false);
    const parent = emitComponentModule(graph, graph.components.get('m-el')!);
    expect(parent).toMatch(/\$dom\.attachShadow\(\$n\d+, true\);/u);
  });

  it('a component that is not a control-component has none', () => {
    const graph = graphWith('<template shadowrootmode="open"><input control="@ctrl"></template>');
    expect(bridgeIds(graph).has('app-input')).toBe(false);
    expect(emitComponentClientModule(graph, child(graph))).not.toContain('static field');
    expect(bridgeOf(child(graph).doc.template!, child(graph).source)).toEqual({ bridge: null, problems: [] });
  });
});
