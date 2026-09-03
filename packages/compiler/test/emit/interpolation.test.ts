/**
 * BUG-21 §4.7 — text and an interpolation the author wrote together come out as ONE thing.
 *
 * `Hello @name` is one text node built from one ES6 template, and `href="/customer/@id"` is
 * one attribute built from one ES6 template. Both are the same answer to the same question,
 * and the reason is the reason of `runs.ts`: HTML has no boundary between two text nodes, so
 * a pair of them serializes to one and the parser hands one back. Emitting two would build a
 * server tree the client cannot adopt — and it would be two nodes where the author wrote one
 * string.
 *
 * The other half is what the interpolated value may NOT do. Nothing here escapes anything,
 * and that is deliberate: what `$dom.text` and `$dom.setAttr` receive is the VALUE. The
 * server re-encodes it when it serializes it — which is where the escaping has to be, since
 * that is the only place the value becomes markup — and the client sets it through the DOM,
 * which never parses. Both halves are proved below on a value that would be an injection if
 * either of them got it wrong.
 */

import { describe, expect, it } from 'vitest';
import { SsrDom, renderToString } from '@fudic/ssr';
import {
  resolveComponents,
  emitComponentModule,
  emitComponentClientModule,
  type ComponentGraph,
} from '../../src/emit/index.js';
import { evalLeafModule, memoryIo } from './_support.js';

const COMPONENT = `@code {
  const { name = '', id = '' } = props<{ name?: string; id?: string }>();
}

<head>
  <style>:host { display: block; }</style>
</head>

<x-mix>
  <template shadowrootmode="open">
    <p>Hello @name</p>
    <a href="/customer/@id" title="Ver @name">go</a>
  </template>
</x-mix>
`;

const graph: ComponentGraph = resolveComponents(
  '/page.fud',
  memoryIo({
    '/page.fud':
      '<!DOCTYPE html>\n<html><head><link rel="component" href="./x-mix.fud"></head>' +
      '<body><x-mix></x-mix></body></html>\n',
    '/x-mix.fud': COMPONENT,
  }),
);
const component = graph.components.get('x-mix')!;
const server = emitComponentModule(graph, component);
const client = emitComponentClientModule(graph, component);

/** The HTML the emitted `render` actually paints for one instance. */
function painted(props: Record<string, unknown>): string {
  const dom = new SsrDom();
  const host = dom.element('x-mix');
  evalLeafModule(server).render(dom, dom.attachShadow(host), props);
  return renderToString(host);
}

describe('a text run with a hole is ONE node, and one template', () => {
  it('the server builds it with a single $dom.text', () => {
    expect(server).toContain("$dom.text(`Hello ${(name) ?? ''}`)");
    // One text node appended to the `<p>`: two would be two nodes for one string the author
    // wrote, and the parser would hand back one of them anyway.
    expect([...server.matchAll(/\$dom\.text\([^\n]*\$dom\.append\(\$n0,/gu)]).toHaveLength(1);
  });

  it('the client fabricates one node and lets $a write its text', () => {
    // The node is structure and the text is state (SDD-15 §4.3): `c()` makes it empty and
    // `$a()` fills it, so create and update converge on the same statement.
    expect(client).toContain("$dom.text('')");
    expect(client).toContain("$v = `Hello ${(name) ?? ''}`;");
    expect(client).toContain('$dom.setText(');
  });

  it('a nullish hole prints nothing, never the word `undefined`', () => {
    expect(painted({})).toContain('<p>Hello </p>');
    expect(painted({ name: 'Ada' })).toContain('<p>Hello Ada</p>');
  });
});

describe('a mixed attribute is ONE template too', () => {
  it('both branches compose the same string, `?? \'\'` per hole', () => {
    expect(server).toContain("`/customer/${(id) ?? ''}`");
    expect(server).toContain("`Ver ${(name) ?? ''}`");
    expect(client).toContain("`/customer/${(id) ?? ''}`");
    expect(client).toContain("`Ver ${(name) ?? ''}`");
  });

  it('leaves a missing hole empty instead of writing it into the URL', () => {
    // `/customer/undefined` is a URL, and a wrong one. `/customer/` is visibly incomplete.
    expect(painted({})).toContain('href="/customer/"');
    expect(painted({ id: '7' })).toContain('href="/customer/7"');
  });

  it('keeps the lone `@expr` shape unstringified, which is what decision 21 reads', () => {
    // The `?? ''` belongs to the mixed shape only: for a lone expression the nullish value
    // is the signal that omits the attribute altogether.
    const lone = resolveComponents(
      '/page.fud',
      memoryIo({
        '/page.fud':
          '<!DOCTYPE html>\n<html><head><link rel="component" href="./x-lone.fud"></head>' +
          '<body><x-lone></x-lone></body></html>\n',
        '/x-lone.fud':
          '@code {\n  const { on } = props<{ on?: boolean }>();\n}\n' +
          '<x-lone>\n  <template shadowrootmode="open"><input disabled=@on></template>\n</x-lone>\n',
      }),
    );
    const src = emitComponentModule(lone, lone.components.get('x-lone')!);
    expect(src).toContain('const $v = (on);');
    expect(src).not.toContain("(on) ?? ''");
  });
});

describe('the value is sanitized where it becomes markup, and only there', () => {
  const HOSTILE = '<img src=x onerror="alert(1)"> & "';

  it('the server escapes it in text and in the attribute when it serializes', () => {
    const html = painted({ name: HOSTILE, id: HOSTILE });
    // Text context: `& < >`. The tag never opens.
    expect(html).toContain('Hello &lt;img src=x onerror="alert(1)"&gt; &amp; "');
    const text = html.slice(html.indexOf('<p>'), html.indexOf('</p>'));
    expect(text).not.toContain('<img');
    // Attribute context: `& "`. A `<` inside a quoted value is inert; what would break out
    // is the quote, and that is the one escaped.
    expect(html).toContain('&amp; &quot;');
    expect(html).not.toContain('"><img');
  });

  it('and the emit itself escapes nothing: what setAttr receives is the value', () => {
    // The template holds the expression and nothing else — no `escapeText` in the generated
    // code, on either branch. Escaping in the emit would double-encode on the client, where
    // the value is set through the DOM and never through a parser.
    expect(server).not.toContain('escapeText');
    expect(client).not.toContain('escapeText');
    expect(client).not.toContain('innerHTML');
  });

  it('a backtick or a `${` in the author’s own text cannot break out of the template', () => {
    const tricky = resolveComponents(
      '/page.fud',
      memoryIo({
        '/page.fud':
          '<!DOCTYPE html>\n<html><head><link rel="component" href="./x-tick.fud"></head>' +
          '<body><x-tick></x-tick></body></html>\n',
        '/x-tick.fud':
          '@code {\n  const { name = "" } = props<{ name?: string }>();\n}\n' +
          '<x-tick>\n  <template shadowrootmode="open">' +
          '<p>`${alert(1)}` @name</p><a title="`${alert(2)}` @name">x</a></template>\n</x-tick>\n',
      }),
    );
    const src = emitComponentModule(tricky, tricky.components.get('x-tick')!);
    // Escaped in the literal halves of both templates, so the only holes are the author's.
    expect(src).toContain('\\`\\${alert(1)}\\` ${(name)');
    expect(src).toContain('\\`\\${alert(2)}\\` ${(name)');
    const dom = new SsrDom();
    const host = dom.element('x-tick');
    evalLeafModule(src).render(dom, dom.attachShadow(host), { name: 'ok' });
    expect(renderToString(host)).toContain('<p>`${alert(1)}` ok</p>');
  });
});
