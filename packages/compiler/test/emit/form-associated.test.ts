/**
 * SDD-34 §6.9 — the control-component: what the marker `formassociated` changes in the emit.
 *
 * A compile-time marker (decision 111) that never reaches the DOM and decides three things:
 * which class the chunk extends, whether the shadow root delegates focus, and whether the tag
 * joins the page map's `eager` list. Without it, none of the three.
 */

import { describe, expect, it } from 'vitest';
import { SsrDom, renderToString } from '@fudic/ssr';
import {
  emitComponentModule,
  emitComponentClientModule,
  emitPageModule,
  resolveComponents,
  formAssociatedTags,
  type ComponentGraph,
} from '../../src/emit/index.js';
import { memoryIo } from './_support.js';

/** A page hosting `<app-input>` — marked or not — plus a plain component beside it. */
function build(marker: string): ComponentGraph {
  return resolveComponents(
    '/home.fud',
    memoryIo({
      '/home.fud':
        '<!DOCTYPE html>\n<html><head>' +
        '<link rel="component" href="./app-input.fud">' +
        '<link rel="component" href="./app-plain.fud">' +
        '</head><body><app-input></app-input><app-plain></app-plain></body></html>',
      '/app-input.fud':
        "@code {\n  import { f } from './user.form.js';\n}\n" +
        `<app-input>\n  <template shadowrootmode="open"${marker}><input control="@f.title"></template>\n</app-input>\n`,
      '/app-plain.fud':
        '@code {\n  @client {\n    const n = 1;\n  }\n}\n' +
        '<app-plain>\n  <template shadowrootmode="open"><button @click="@go()"></button></template>\n</app-plain>\n',
    }),
  );
}

const marked = build(' formassociated');
const plain = build('');

/** The HTML a page renders for one of its component hosts. */
function pageHtml(graph: ComponentGraph): string {
  const dom = new SsrDom();
  const root = dom.element('div');
  // The component's own module is enough: the marker rides the host that opens the shadow.
  const host = dom.element('app-input');
  const shadow = dom.attachShadow(host, formAssociatedTags(graph).has('app-input'));
  dom.append(shadow, dom.element('input'));
  dom.append(root, host);
  return renderToString(root);
}

describe('§6.9 — the marker decides the class', () => {
  it('extends FudicControlElement and imports it', () => {
    const client = emitComponentClientModule(marked, marked.components.get('app-input')!);
    expect(client).toContain("import { FudicControlElement } from '@fudic/forms/element';");
    expect(client).toContain('class extends FudicControlElement {');
    // One base, never two: `FudicElement` is not imported for something nothing extends.
    expect(client).not.toContain('class extends FudicElement');
  });

  it('imports `subscribe` and nothing else from core when it has a signal of its own', () => {
    // The base comes from `@fudic/forms`, so `FudicElement` is not imported for something
    // nothing extends — but `subscribe` still is, because the component repaints itself.
    const graph = resolveComponents(
      '/home.fud',
      memoryIo({
        '/home.fud':
          '<!DOCTYPE html>\n<html><head><link rel="component" href="./app-live.fud"></head>' +
          '<body><app-live></app-live></body></html>',
        '/app-live.fud':
          '@code {\n  @client {\n    import { signal } from \'@fudic/core\';\n    const n = signal(1);\n  }\n}\n' +
          '<app-live>\n  <template shadowrootmode="open" formassociated><p>@(n())</p></template>\n</app-live>\n',
      }),
    );
    const client = emitComponentClientModule(graph, graph.components.get('app-live')!);
    expect(client).toContain("import { subscribe as $sub } from '@fudic/core';");
    expect(client).toContain("import { FudicControlElement } from '@fudic/forms/element';");
    expect(client).toContain('class extends FudicControlElement {');
    expect(client).not.toContain('FudicElement,');
  });

  it('without the marker it extends FudicElement, and imports no form base', () => {
    const client = emitComponentClientModule(plain, plain.components.get('app-input')!);
    expect(client).toContain("import { FudicElement } from '@fudic/core';");
    expect(client).toContain('class extends FudicElement {');
    expect(client).not.toContain('FudicControlElement');
  });
});

describe('§6.9 — the marker delegates focus', () => {
  it('the host opens its shadow with `delegatesFocus` and serializes the attribute', () => {
    expect(formAssociatedTags(marked).has('app-input')).toBe(true);
    // No `shadowrootadoptedstylesheets` beside it: this fixture declares no `<style>`, and
    // since BUG-31 T4 a component with no CSS announces no sheet to adopt.
    expect(pageHtml(marked)).toContain(
      '<template shadowrootmode="open" shadowrootdelegatesfocus>',
    );
    expect(pageHtml(marked)).not.toContain('shadowrootadoptedstylesheets');
  });

  it('without the marker the template carries no such attribute', () => {
    expect(formAssociatedTags(plain).has('app-input')).toBe(false);
    expect(pageHtml(plain)).not.toContain('shadowrootdelegatesfocus');
  });

  it('the page module passes the flag to the host it fabricates', () => {
    expect(emitPageModule(marked)).toContain('$dom.attachShadow($n0, true)');
    expect(emitPageModule(plain)).toContain('$dom.attachShadow($n0)');
  });

  it('the marker itself never reaches the DOM', () => {
    // An unknown attribute on a `<template>` is inert, so the browser would ignore it — and
    // the compiler consumes it rather than leaving it there to be ignored.
    const server = emitComponentModule(marked, marked.components.get('app-input')!);
    expect(server).not.toContain('formassociated');
  });
});

describe('§6.9 — the marker joins `eager`, and nothing else does', () => {
  it('the page map lists the marked tag and only it', () => {
    const page = emitPageModule(marked);
    expect(page).toContain('const FUD_EAGER = ["app-input"];');
    expect(page).toContain("jsonBlock($dom, $body, 'fud-eager', FUD_EAGER);");
    // The plain component of the same page hydrates too — and by gesture, not by this list.
    expect(page).not.toContain('app-plain"]');
  });

  it('a page with no control-component publishes no list at all', () => {
    const page = emitPageModule(plain);
    expect(page).not.toContain('FUD_EAGER');
    expect(page).not.toContain('fud-eager');
  });
});
