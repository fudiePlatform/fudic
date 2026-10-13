// @vitest-environment happy-dom
/**
 * `ref="@name"` (decision 30) — the author's own `let` receives the node.
 *
 * Three nets. The two helpers that decide WHICH variable a ref writes (`refTarget`,
 * `refTargets`), on authentic ASTs. The emitted text: the write goes into the hookup `$s`,
 * which create and hydrate both reach, with its teardown beside it; inside a construct it
 * goes into the block's own `$s`, and the target is not a parameter of the block. And the
 * factory run over a live DOM, because the property that matters — the variable holds the
 * node on both paths and is `null` again once the node is gone — is about values, not text.
 */

import { describe, expect, it } from 'vitest';
import { browserDom } from '@fudic/dom';
import {
  resolveComponents,
  emitComponentClientModuleMapped,
  emitComponentModule,
  type ComponentGraph,
} from '../../src/emit/index.js';
import { refTarget, refTargets } from '../../src/emit/constructs.js';
import type { ElementNode, HtmlContent } from '../../src/html/index.js';
import type { ComponentDocument } from '../../src/document/index.js';
import { memoryIo, parse } from './_support.js';
import { clientFactory, controller, mountAsDsd, serverShadowHtml } from './hydrate/_harness.js';

/**
 * A component whose shadow root holds `markup`, with a `@client` block in front of it. The
 * prop `otro` is a name an update can bring again: what a block body reads of it becomes a
 * parameter of the block, which is the contrast a ref target is measured against.
 */
const component = (tag: string, client: string, markup: string): string =>
  `@code {\n  const { otro = 1 } = props<{ otro?: number }>();\n  @client {\n${client}  }\n}\n` +
  `<${tag}>\n  <template shadowrootmode="open">${markup}</template>\n</${tag}>\n`;

function graphOf(tag: string, source: string): ComponentGraph {
  return resolveComponents(
    '/page.fud',
    memoryIo({
      '/page.fud': `<link rel="component" href="./${tag}.fud">\n<html><head></head><body><${tag}></${tag}></body></html>\n`,
      [`/${tag}.fud`]: source,
    }),
  );
}

const chunk = (graph: ComponentGraph, tag: string): string =>
  emitComponentClientModuleMapped(graph, graph.components.get(tag)!).code;

/** The shadow-root content of the one component in `source`. */
function shadowContent(source: string): readonly HtmlContent[] {
  return (parse(source) as ComponentDocument).template!.children;
}

/** The first element of the shadow root. */
function firstElement(markup: string): { el: ElementNode; source: string } {
  const source = component('x-t', '', markup);
  const el = shadowContent(source).find((n) => n.type === 'element') as ElementNode;
  return { el, source };
}

describe('refTarget: the variable one element writes', () => {
  it('names the identifier of a well-formed ref', () => {
    const { el, source } = firstElement('<input class="a" ref="@campo">');
    expect(refTarget(el, source)).toBe('campo');
  });

  it('is null on an element with no ref', () => {
    const { el, source } = firstElement('<input class="a">');
    expect(refTarget(el, source)).toBeNull();
  });

  it('is null on a malformed ref: the emit does not guess (FUD0094)', () => {
    for (const markup of ['<b ref="@a.b">x</b>', '<b ref="@(x)">x</b>', '<b ref="x">x</b>']) {
      const { el, source } = firstElement(markup);
      expect(refTarget(el, source), markup).toBeNull();
    }
  });
});

describe('refTargets: every variable a tree writes', () => {
  it('reaches nested elements and the branches of @if and @switch', () => {
    const source = component(
      'x-t',
      '',
      '<div ref="@a"><span ref="@b">t</span></div>' +
        '@if (k) {<p ref="@c">x</p>} else {<p><i ref="@d">y</i></p>}' +
        '@switch (k) { case 1: {<em ref="@e">z</em>} default: {<u ref="@f">w</u>} }' +
        '<b ref="@g.h">bad</b>text',
    );
    expect([...refTargets(shadowContent(source), source)].sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('is empty on a tree with no ref', () => {
    const source = component('x-t', '', '<p>text</p>@if (k) {<b>x</b>}');
    expect(refTargets(shadowContent(source), source).size).toBe(0);
  });
});

const CLIENT =
  "    import { signal } from '@fudic/core';\n" +
  '    let campo = null;\n' +
  '    let aviso = null;\n' +
  '    const abierto = signal(false);\n' +
  '    globalThis.__ref = { campo: () => campo, aviso: () => aviso, abrir: (v) => abierto.set(v) };\n';

const MARKUP =
  '<input ref="@campo" value="hola">' + '@if (abierto()) {<p class="aviso" ref="@aviso">@otro</p>}';

describe('the emitted text', () => {
  const graph = graphOf('x-ref', component('x-ref', CLIENT, MARKUP));
  const code = chunk(graph, 'x-ref');

  it('writes the node in the factory hookup, and clears it with the teardowns', () => {
    const hookup = code.slice(code.lastIndexOf('const $s = () => {'));
    expect(hookup).toMatch(/campo = \$n\d+;\n\s*\$d\.push\(\(\) => \{ campo = null; \}\);/u);
    // Both paths reach the hookup: that is why the write lives there and not in `c`.
    expect(code).toMatch(/c: \(\) => \{[\s\S]*?\$s\(\);\n\s*\},\n\s*h: \(\) => \{[\s\S]*?\$s\(\);\n\s*\},/u);
  });

  it('writes the node of a block in the block´s own hookup', () => {
    const block = code.slice(code.indexOf('const $b0'), code.indexOf('const $q0'));
    expect(block).toMatch(/const \$s = \(\) => \{\n\s*aviso = \$n\d+;\n\s*\$d\.push\(\(\) => \{ aviso = null; \}\);/u);
    expect(block).toContain('r: () => { $d.forEach(($f) => $f());');
  });

  it('does not pass a ref target to the block by value — a read the body makes is still a parameter', () => {
    const head = /const \$b0 = \(([^)]*)\) =>/u.exec(code)![1]!;
    expect(head.split(', ')).toContain('otro');
    expect(head.split(', ')).not.toContain('aviso');
  });

  it('writes nothing for a malformed ref, and leaves no ref attribute behind', () => {
    const bad = graphOf('x-bad', component('x-bad', '    let a = null;\n', '<b ref="@a.b">x</b><i ref="@(a)">y</i>'));
    const text = chunk(bad, 'x-bad');
    expect(text).not.toMatch(/\ba = \$n/u);
    expect(text).not.toContain('"ref"');
  });

  it('the server emits nothing for a ref', () => {
    const server = emitComponentModule(graph, graph.components.get('x-ref')!);
    expect(server).not.toMatch(/["']ref["']|campo|aviso =/u);
    expect(serverShadowHtml(graph, 'x-ref', {})).toBe('<input value="hola">');
  });
});

type Probe = { campo: () => Element | null; aviso: () => Element | null; abrir: (v: boolean) => void };
const probe = (): Probe => (globalThis as unknown as { __ref: Probe }).__ref;

describe('run over a live DOM', () => {
  const graph = graphOf('x-run', component('x-run', CLIENT, MARKUP));

  it('create: the variable holds the node the factory built, and r() sets it back to null', () => {
    const host = document.createElement('x-run');
    const shadow = host.attachShadow({ mode: 'open' });
    document.body.append(host);
    const ctl = controller(clientFactory(graph, 'x-run'), browserDom, shadow, []);
    ctl.c();
    expect(probe().campo()).toBe(shadow.querySelector('input'));

    ctl.r!();
    expect(probe().campo()).toBeNull();
  });

  it('hydrate: the variable holds the node the SERVER painted', () => {
    const { shadow } = mountAsDsd('x-run', serverShadowHtml(graph, 'x-run', {}));
    const painted = shadow.querySelector('input');
    controller(clientFactory(graph, 'x-run'), browserDom, shadow, []).h();
    expect(probe().campo()).toBe(painted);
    expect((probe().campo() as HTMLInputElement).value).toBe('hola');
  });

  it('a ref inside @if is the node while the branch lives, and null once it leaves', () => {
    const { shadow } = mountAsDsd('x-run', serverShadowHtml(graph, 'x-run', {}));
    controller(clientFactory(graph, 'x-run'), browserDom, shadow, []).h();
    expect(probe().aviso()).toBeNull();

    probe().abrir(true);
    const p = shadow.querySelector('p.aviso');
    expect(p).not.toBeNull();
    expect(probe().aviso()).toBe(p);
    expect(p!.textContent).toBe('1');

    probe().abrir(false);
    expect(shadow.querySelector('p.aviso')).toBeNull();
    expect(probe().aviso()).toBeNull();

    probe().abrir(true);
    expect(probe().aviso()).toBe(shadow.querySelector('p.aviso'));
    expect(probe().aviso()).not.toBe(p); // a fresh node, not the one retired
  });
});
