/**
 * SDD-61 §4.2 — where the portable view lies in a `.fud`: what the typed pass is handed. Every
 * root of the view with its place, never a handler nor a callback; the expressions and the
 * declarators of the server cut; the parameters of each snippet; and their spans in the `.fud`.
 */

import { describe, expect, it } from 'vitest';
import type { OxcNode } from '../../src/oxc/index.js';
import type { Node } from '../../src/types/index.js';
import { portableRegions, type PortableRegions } from '../../src/semantic/index.js';
import { viewInput } from './_view.js';

function regions(code: string, template: string, after = ''): { readonly text: string; readonly found: PortableRegions } {
  const text = `@code {\n${code}\n}\n<x-a><template shadowrootmode="open">${template}</template></x-a>\n${after}`;
  return { text, found: portableRegions(viewInput(text)) };
}

const slice = (text: string, found: PortableRegions, node: OxcNode): string => {
  const at = found.span(node);
  return text.slice(at.start, at.end);
};

describe('portableRegions', () => {
  it('hands every root of the view with its place, and no handler nor callback', () => {
    const { text, found } = regions(
      `import { signal } from '@fudic/core';\n  const n = signal(1);\n  function go() {}`,
      `<p>@n()</p>
@if (n() > 0) { <b></b> }
@switch (n()) { case 1: <i></i> }
@foreach (const x of [n()]) key (x) { <i></i> }
@for (let i = 0; i < n(); i++) { <i></i> }
@while (n() < 0) { <i></i> }
@{ let k = 0; }
<app-b .v=@n() .cb=@(() => go()) .named=@go></app-b>
<button @click=@(() => go())></button>`,
    );
    const roots = found.view.map((root) => {
      const nodes = Array.isArray(root.node) ? (root.node as readonly OxcNode[]) : [root.node as OxcNode];
      return `${root.place} ${nodes.map((node) => slice(text, found, node)).join(' ')}`;
    });
    expect(roots).toEqual([
      'value n()',
      'condition n() > 0',
      'subject n()',
      'value 1',
      'for-of const x of [n()]',
      'key x',
      'for let i = 0; i < n(); i++',
      'condition n() < 0',
      'statements let k = 0;',
      'value n()',
    ]);
  });

  it('hands the server cut of the @code: what the list checks, and the declarators that hold a value', () => {
    const { text, found } = regions(
      `import { signal, computed, inject } from '@fudic/core';
  const { a = 1 } = props<{ a?: number }>();
  const n = signal(a);
  const doble = computed(() => n() * 2);
  const svc = inject(Token);
  const lista = [1, 2];`,
      `<p>@doble() @(lista.length) @(svc === svc)</p>`,
    );
    expect(found.cut.map((node) => slice(text, found, node))).toEqual(['n() * 2', 'a', '1']);
    expect(found.declarations.map((node) => slice(text, found, node))).toEqual([
      'doble = computed(() => n() * 2)',
      'n = signal(a)',
      'lista = [1, 2]',
    ]);
  });

  it('hands the parameters of every snippet', () => {
    const { text, found } = regions('', '<p></p>', '@snippet fila(item: string, n = 1) { <span>@item</span> }\n');
    expect(found.parameters.map((node) => slice(text, found, node))).toEqual(['item: string', 'n = 1']);
  });

  it('hands nothing for a snippet whose parameters Oxc could not read', () => {
    const { found } = regions('', '<p></p>', '@snippet fila(item: ) { <span></span> }\n');
    expect(found.parameters).toEqual([]);
  });

  it('hands nothing for a snippet the host never registered', () => {
    const input = viewInput(`<x-a><template shadowrootmode="open"></template></x-a>\n@snippet fila(item: string) { <span></span> }\n`);
    const unregistered = { ...input, fragmentId: (node: Node) => (node.type === 'snippet' ? undefined : input.fragmentId(node)) };
    expect(portableRegions(unregistered).parameters).toEqual([]);
  });

  it('walks the server cut once per input, whoever asks', () => {
    const input = viewInput(`@code {\n  const n = 1;\n}\n<x-a><template shadowrootmode="open"><p>@(n + 1)</p></template></x-a>`);
    expect(portableRegions(input).declarations).toBe(portableRegions(input).declarations);
  });
});
