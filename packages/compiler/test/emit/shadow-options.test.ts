/**
 * SDD-57 §6.9: the options of a shadow root its author writes on the root `<template>` —
 * `shadowrootdelegatesfocus`, `shadowrootclonable`, `shadowrootserializable` — reach both roads.
 * The PARENT opens the child's shadow root on the server with them, and the child's class carries
 * them for the shadow root it opens when it is created at runtime.
 */

import { describe, expect, it } from 'vitest';
import {
  emitComponentClientModule,
  emitComponentModule,
  resolveComponents,
  shadowOptions,
  type ComponentGraph,
} from '../../src/emit/index.js';
import { shadowOptionsOf } from '../../src/binding/index.js';
import { memoryIo } from './_support.js';

/** A parent `<m-el>` hosting `<x-child>`, with the child's root template attributes as given. */
function graphWith(attrs: string): ComponentGraph {
  return resolveComponents(
    '/home.fud',
    memoryIo({
      '/home.fud':
        '<!DOCTYPE html>\n<html><head><link rel="component" href="./m.fud"></head><body></body></html>',
      '/m.fud':
        '<link rel="component" href="./x-child.fud">\n' +
        '<m-el>\n  <template shadowrootmode="open"><x-child></x-child></template>\n</m-el>\n',
      '/x-child.fud': `<x-child>\n  <template shadowrootmode="open"${attrs}><input id="campo"></template>\n</x-child>\n`,
    }),
  );
}

const parentOf = (graph: ComponentGraph) => emitComponentModule(graph, graph.components.get('m-el')!);
const clientOf = (graph: ComponentGraph) => emitComponentClientModule(graph, graph.components.get('x-child')!);

describe('the options a template declares', () => {
  it('none: the parent opens it as before, and the class declares nothing', () => {
    const graph = graphWith('');
    expect(shadowOptions(graph).has('x-child')).toBe(false);
    expect(parentOf(graph)).toMatch(/\$dom\.attachShadow\(\$n\d+\);/u);
    expect(clientOf(graph)).not.toMatch(/static (delegatesFocus|clonable|serializable)/u);
  });

  it('delegatesfocus alone', () => {
    const graph = graphWith(' shadowrootdelegatesfocus');
    expect(parentOf(graph)).toMatch(/\$dom\.attachShadow\(\$n\d+, true\);/u);
    expect(clientOf(graph)).toContain('static delegatesFocus = true;');
  });

  it('clonable and serializable, after the two positions they do not use', () => {
    const graph = graphWith(' shadowrootclonable shadowrootserializable');
    expect(parentOf(graph)).toMatch(/\$dom\.attachShadow\(\$n\d+, false, undefined, true, true\);/u);
    const client = clientOf(graph);
    expect(client).toContain('static clonable = true;');
    expect(client).toContain('static serializable = true;');
    expect(client).not.toContain('static delegatesFocus');
  });

  it('with a bridge: every position up to the last one set', () => {
    const graph = graphWith(' shadowrootreferencetarget="campo" shadowrootclonable');
    expect(parentOf(graph)).toMatch(/\$dom\.attachShadow\(\$n\d+, false, "campo", true\);/u);
  });

  it('reads the attributes case-insensitively, as HTML does', () => {
    const graph = graphWith(' ShadowRootSerializable');
    expect(shadowOptionsOf(graph.components.get('x-child')!.doc.template!)).toEqual({
      delegatesFocus: false,
      clonable: false,
      serializable: true,
    });
  });
});
