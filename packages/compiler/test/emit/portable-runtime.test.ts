/**
 * SDD-61 §4.4, points 3–5, as the emit writes them: `@empty` on both sides, `now()` in the slot
 * of its signal, and the spreads of a native element in the place of the first one. What they
 * paint is `packages/testing`'s `portable-view.test.ts`; here, the shape that paints it.
 */

import { describe, expect, it } from 'vitest';
import {
  emitComponentClientModule,
  emitComponentModule,
  emitRouteClientModule,
  emitRouteModule,
  resolveComponents,
  resolveDocument,
} from '../../src/emit/index.js';
import { memoryIo } from './_support.js';

function graphOf(code: string, template: string) {
  const io = memoryIo({
    '/page.fud':
      '<link rel="component" href="./x-own.fud">\n' +
      '<html><head></head><body><x-own></x-own></body></html>\n',
    '/x-own.fud': `@code {\n${code}}\n<x-own>\n  <template shadowrootmode="open">${template}</template>\n</x-own>\n`,
  });
  const g = resolveComponents('/page.fud', io);
  return { graph: g, comp: g.components.get('x-own')! };
}

const client = (code: string, template: string): string => {
  const { graph, comp } = graphOf(code, template);
  return emitComponentClientModule(graph, comp, {});
};

const server = (code: string, template: string): string => {
  const { graph, comp } = graphOf(code, template);
  return emitComponentModule(graph, comp, {});
};

const between = (src: string, from: string, to: string): string => src.slice(src.indexOf(from), src.indexOf(to, src.indexOf(from)));

const PROPS = '  const { xs = [], label = "none" } = props<{ xs?: string[]; label?: string }>();\n';
const NESTED = '<ul>@foreach (const x of xs) key (x) {<li>@x</li>} @empty {<li>@label</li>}</ul>';
const ROOT = '@foreach (const x of xs) key (x) {<b>@x</b>} @empty {<i>@label</i>}';

describe('@empty on the server (§4.4.3)', () => {
  it('the loop remembers whether it turned, and paints the block when it did not', () => {
    const src = server(PROPS, NESTED);
    const turned = /let (\$n\d+) = false;/u.exec(src)![1]!;
    expect(src).toContain(`${turned} = true;`);
    expect(src.indexOf(`${turned} = true;`)).toBeLessThan(src.indexOf(`if (!${turned}) {`));
  });

  it('a loop with no @empty writes none of it', () => {
    expect(server(PROPS, '<ul>@foreach (const x of xs) key (x) {<li>@x</li>}</ul>')).not.toContain('= false;');
  });

  it('@for and @while too', () => {
    const src = server('  let k = 0;\n', '@for (let i = 0; i < 2; i++) {<b></b>} @empty {<i></i>}@while (k > 0) {<s></s>@{ k = k - 1; }} @empty {<u></u>}');
    expect(src.match(/if \(!\$n\d+\) \{/gu)).toHaveLength(2);
  });
});

describe('@empty on the client (§4.4.3)', () => {
  it('its block has no key, and the mark the reconciliation finds it by', () => {
    const src = client(PROPS, NESTED);
    expect(src).toContain('key: undefined,\n');
    expect(src).toContain('z: true,');
  });

  it('it is built, or adopted, when the loop did not turn, in the same registry', () => {
    const src = client(PROPS, NESTED);
    const fab = between(src, 'c: () => {', 'h: () => {');
    expect(fab).toMatch(/if \(\$k0\.length === 0\) \{ const \$i = \$b1\(\$n\d+, null, label\); \$i\.c\(\); \$i\.m\(\); \$i\.s\(\); \$k0\.push\(\$i\); \}/u);
    const adopt = between(src, 'h: () => {', 'u: (');
    expect(adopt).toMatch(/if \(\$k0\.length === 0\) \{ const \$i = \$b1\(\$n\d+, null, label\); \$c\d+ = \$i\.h\(\$c\d+\); \$i\.s\(\); \$k0\.push\(\$i\); \}/u);
  });

  it('at the root of the template its mount is deferred, like the rows', () => {
    const fab = between(client(PROPS, ROOT), 'c: () => {', 'h: () => {');
    expect(fab).toMatch(/if \(\$k0\.length === 0\) \{ const \$i = \$b1\(\$shadow, null, label\); \$i\.c\(\); \$i\.s\(\); \$k0\.push\(\$i\); \}/u);
  });

  it('the reconciliation keeps the live @empty for zero rows, builds it, or retires it', () => {
    const src = client(PROPS, NESTED);
    expect(src).toContain('let $z = null;');
    expect(src).toContain('for (const $i of $k0) { if ($i.z) $z = $i; else if ($prev.has($i.key)) $gone.push($i); else $prev.set($i.key, $i); }');
    expect(src).toMatch(
      /if \(\$next\.length === 0\) \{ if \(\$z !== null\) \{ \$z\.u\(label\); \$next\.push\(\$z\); \} else \{ const \$i = \$b1\(\$n\d+, null, label\); \$i\.c\(\); \$i\.m\(\); \$i\.s\(\); \$next\.push\(\$i\); \} \} else if \(\$z !== null\) \$gone\.push\(\$z\);/u,
    );
  });

  it('the @empty reads nothing the header declares', () => {
    const src = client(PROPS, NESTED);
    expect(src).toMatch(/const \$b1 = \(\$parent, \$anchor, label\) => \{/u);
  });
});

describe('now() in fud-state (§4.4.4)', () => {
  const CODE = '  import { signal, now } from "@fudic/core";\n  const ahora = signal(now());\n  const otra = signal(1);\n';
  const VIEW = '<time>@(ahora().toISOString())</time><button @click=@(() => otra.set(2))>x</button>';

  it('the server evaluates it once, and serialises it in its slot', () => {
    const src = server(CODE, VIEW);
    expect(src).toContain('const ahora = ((v) => () => v)(now()); // inert signal');
    expect(src).toContain('const otra = () => (1); // inert signal');
    expect(src).toContain('{ of: ahora, value: ahora() }');
  });

  it('the client that hydrates takes the instant from the slot, a cell as is, and calls now() only from scratch', () => {
    const src = client(CODE, VIEW);
    expect(src).toContain('const ahora = $p2 instanceof Date ? signal($p2) : $p2 ?? signal(now());');
    expect(src).toContain('const otra = signal(1);');
  });

  it('so does a route', () => {
    const route = [
      '<link rel="layout" href="./l.fud">',
      '@code {',
      '  import { signal, now } from "@fudic/core";',
      '  const ahora = signal(now());',
      '}',
      '<p>@(ahora().toISOString())</p><button @click=@(() => ahora.set(now()))>x</button>',
    ].join('\n');
    const io = memoryIo({ '/r.fud': route, '/l.fud': '<!DOCTYPE html><html><head>@RenderHead()</head><body>@RenderBody()</body></html>' });
    const graph = resolveDocument('/r.fud', io).value;
    expect(emitRouteModule(graph, { routeName: 'r' })).toContain('const ahora = ((v) => () => v)(now());');
    expect(emitRouteClientModule(graph)).toMatch(/const ahora = (\$\w+) instanceof Date \? signal\(\1\) : \1 \?\? signal\(now\(\)\);/u);
  });
});

describe('the spreads of a native element, where the first one sits (§3.8)', () => {
  const CODE = '  const { e = {}, f = {}, t = "x" } = props<{ e?: object; f?: object; t?: string }>();\n';

  it('on the server, between the explicit attributes around it', () => {
    const src = server(CODE, '<a id="i" ...e title="@t" ...f rel="r">x</a>');
    const order = ['setAttr($n0, "id"', 'setAttrs($n0, [(e), (f)], undefined, ["id","title","rel"])', '"title"', '"rel"'].map((s) => src.indexOf(s));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('on the client, written first among the static attributes too, so a created instance has the same order', () => {
    const fab = between(client(CODE, '<a id="i" ...e rel="r">x</a>'), 'c: () => {', 'h: () => {');
    const order = ['"id"', 'setAttrs($n0, [(e)], undefined, ["id","rel"])', '"rel"'].map((s) => fab.indexOf(s));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});
