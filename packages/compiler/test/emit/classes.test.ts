// @vitest-environment happy-dom
/**
 * SDD-85 §4.5 — the class list, token by token.
 *
 * A static `class` is a literal; `class=@expr` swaps its own tokens; `class:x=@cond` toggles its
 * own. None of them writes the whole attribute, so a class some other code put on the element
 * survives every change. Criteria 19, 23, 24 and 25 on the emitted code and on what the server
 * paints with it; and the same rules on the client — created, hydrated and updated — where a
 * class `extra` added by hand plays the other code (criteria 20, 21, 22 and 26).
 */

import { describe, expect, it } from 'vitest';
import { browserDom, type DomClient } from '@fudic/dom';
import {
  emitComponentClientModule,
  emitComponentModule,
  resolveComponents,
  type ComponentGraph,
} from '../../src/emit/index.js';
import { staticClass } from '../../src/emit/attrs.js';
import { memoryIo } from './_support.js';
import { clientFactory, controller, mountAsDsd, serverShadowHtml } from './hydrate/_harness.js';

/** The props every view below reads, in the order the controller takes them. */
const CODE =
  '@code {\n' +
  '  const { on, expr, o } = props<{ on: boolean; expr: unknown; o: Record<string, unknown> }>();\n' +
  '}\n';

/** Values for `on`, `expr` and `o`, positional as `c` and `u` take them. */
type Values = readonly [on: boolean, expr: unknown, o: Record<string, unknown>];

function graphOf(tag: string, template: string): ComponentGraph {
  return resolveComponents(
    '/page.fud',
    memoryIo({
      '/page.fud': `<link rel="component" href="./${tag}.fud">\n<html><head></head><body><${tag}></${tag}></body></html>\n`,
      [`/${tag}.fud`]: `${CODE}<${tag}>\n  <template shadowrootmode="open">${template}</template>\n</${tag}>\n`,
    }),
  );
}

/** The `class` of every element with an `id` in `html`, parsed: `null` where there is none. */
function classesIn(root: ParentNode): Record<string, string | null> {
  return Object.fromEntries([...root.querySelectorAll('[id]')].map((el) => [el.id, el.getAttribute('class')]));
}

function serverClasses(graph: ComponentGraph, tag: string, values: Values): Record<string, string | null> {
  const [on, expr, o] = values;
  const box = document.createElement('div');
  box.innerHTML = serverShadowHtml(graph, tag, { on, expr, o });
  return classesIn(box);
}

/** A component created in the browser, with a door to update it. */
function created(
  graph: ComponentGraph,
  tag: string,
  values: Values,
): { shadow: ShadowRoot; set: (values: Values) => void } {
  const host = document.createElement(tag);
  const shadow = host.attachShadow({ mode: 'open' });
  document.body.append(host);
  const ctl = controller(clientFactory(graph, tag), browserDom, shadow, values);
  ctl.c();
  return { shadow, set: (next) => ctl.u([, , ...next]) };
}

const ORDER = 'x-cls-order';
const orderGraph = graphOf(
  ORDER,
  '<p id="lit" class="panel"></p>' +
    '<p id="own" class="activo fijo" class:activo="@on"></p>' +
    '<p id="gone" class="activo" class:activo="@on"></p>' +
    '<p id="seq" class="base" class:b="@on" class:a="@on"></p>' +
    '<p id="exp" class="@expr" class:z="@on"></p>' +
    '<p id="mix" class="base @(expr)" class:z="@on"></p>' +
    '<p id="none" class:a="@on" class:b="@on"></p>' +
    '<p id="spr" ...o></p>',
);

describe('the emitted code (criterion 19)', () => {
  const server = emitComponentModule(orderGraph, orderGraph.components.get(ORDER)!);
  const client = emitComponentClientModule(orderGraph, orderGraph.components.get(ORDER)!);

  it('a static class is a literal, on the server and on the client, with no filter or join', () => {
    expect(server).toMatch(/\$dom\.setAttr\(\$n\d+, 'class', "panel"\);/u);
    // On the client it is in the template, and nowhere else (SDD-85 §4.5).
    expect(client).toMatch(/\$template`[^`]*<p id="lit" class="panel">/u);
    expect(client).not.toContain(`'class', "panel"`);
    for (const module of [server, client]) {
      expect(module).not.toContain('filter(Boolean)');
      expect(module).not.toContain(".join(' ')");
    }
  });

  it('a `class:` toggles its token, and `class=@expr` swaps its tokens', () => {
    expect(server).toMatch(/\$dom\.toggleClass\(\$n\d+, "activo", !!\(\(on\)\)\);/u);
    expect(server).toMatch(/\$dom\.swapClass\(\$n\d+, \(expr\), undefined\);/u);
    expect(client).toMatch(/\$dom\.toggleClass\(\$n\d+, "activo", \$v\);/u);
    expect(client).toMatch(/\$dom\.swapClass\(\$n\d+, \$v, \$o\);/u);
  });

  it('the token a `class:` owns is out of the static literal (rule 1)', () => {
    expect(server).toMatch(/\$dom\.setAttr\(\$n\d+, 'class', "fijo"\);/u);
  });

  it('a change of the swap makes the toggles behind it run again (rule 5)', () => {
    // `exp` is the fourth element: its swap and its one toggle hold consecutive slots.
    const swap = /if \(\$v !== \$w\[(\d+)\]\) \{ const \$o = \$w\[\1\]; \$w\[\1\] = \$v; \$dom\.swapClass\(\$n\d+, \$v, \$o\); \$w\[(\d+)\] = undefined; \}/u.exec(client);
    expect(swap).not.toBeNull();
    expect(Number(swap![2])).toBe(Number(swap![1]) + 1);
  });
});

describe('what the server paints (criteria 23, 24 and 25)', () => {
  it('with every `class:` on: the static tokens, then the swapped, then the toggled in source order', () => {
    expect(serverClasses(orderGraph, ORDER, [true, 'x y', { class: 's' }])).toEqual({
      lit: 'panel',
      own: 'fijo activo',
      gone: 'activo',
      seq: 'base b a',
      exp: 'x y z',
      mix: 'base x y z',
      none: 'a b',
      spr: 's',
    });
  });

  it('with every `class:` off: a token both write is off, and nothing left is no attribute', () => {
    expect(serverClasses(orderGraph, ORDER, [false, null, {}])).toEqual({
      lit: 'panel',
      own: 'fijo',
      gone: null,
      seq: 'base',
      exp: null,
      mix: 'base',
      none: null,
      spr: null,
    });
  });

  it('a value that is not text writes no token, as decision 21 omits a falsy attribute', () => {
    expect(serverClasses(orderGraph, ORDER, [false, true, {}]).exp).toBeNull();
    expect(serverClasses(orderGraph, ORDER, [false, 7, {}]).exp).toBe('7');
  });
});

describe('what the browser creates: the same list, in the same order', () => {
  for (const values of [
    [true, 'x y', { class: 's' }],
    [false, null, {}],
  ] as const satisfies readonly Values[]) {
    it(`with on = ${String(values[0])}`, () => {
      const { shadow } = created(orderGraph, ORDER, values);
      const browser = classesIn(shadow);
      const server = serverClasses(orderGraph, ORDER, values);
      // The one difference the spec allows: the browser keeps an emptied `class=""` (rule 3).
      // Created from nothing, no token was ever put on and taken off, so there is none here.
      expect(browser).toEqual(server);
    });
  }
});

const FOREIGN = 'x-cls-foreign';
const foreignGraph = graphOf(
  FOREIGN,
  '<p id="tog" class="card" class:activo="@on"></p>' +
    '<p id="exp" class="@expr"></p>' +
    '<p id="spr" ...o></p>' +
    '<p id="both" class="@expr" class:k="@on"></p>',
);

describe('a class some other code added survives (criteria 20, 21 and 22)', () => {
  const extra = (shadow: ShadowRoot): void => {
    for (const el of shadow.querySelectorAll('[id]')) el.classList.add('extra');
  };

  it('`class:` toggling several times', () => {
    const view = created(foreignGraph, FOREIGN, [false, '', {}]);
    extra(view.shadow);
    for (const on of [true, false, true]) view.set([on, '', {}]);
    expect(classesIn(view.shadow).tog).toBe('card extra activo');
  });

  it('`class=@expr` from `a b` to `b c`: `a` out, `c` in, `extra` stays', () => {
    const view = created(foreignGraph, FOREIGN, [false, 'a b', {}]);
    extra(view.shadow);
    view.set([false, 'b c', {}]);
    expect(classesIn(view.shadow).exp).toBe('b extra c');
  });

  it('the `class` of a spread on an element with no class of its own', () => {
    const view = created(foreignGraph, FOREIGN, [false, '', { class: 'a b' }]);
    extra(view.shadow);
    view.set([false, '', { class: 'b c' }]);
    expect(classesIn(view.shadow).spr).toBe('b extra c');
    view.set([false, '', {}]);
    expect(classesIn(view.shadow).spr).toBe('extra');
  });

  it('a token both write is as its `class:` says, after the swap took it off (rule 5)', () => {
    const view = created(foreignGraph, FOREIGN, [true, 'k j', {}]);
    expect(classesIn(view.shadow).both).toBe('k j');
    view.set([true, 'j', {}]);
    expect(classesIn(view.shadow).both).toBe('j k');
    view.set([false, 'j', {}]);
    expect(classesIn(view.shadow).both).toBe('j');
  });
});

describe('hydrating writes no class until the first change (criterion 26)', () => {
  /** `browserDom` that counts every class write it is asked for. */
  function counting(): { dom: DomClient<Node>; writes: string[] } {
    const writes: string[] = [];
    const dom: DomClient<Node> = {
      ...browserDom,
      setAttr: (el, name, value) => {
        writes.push(`setAttr ${name}`);
        browserDom.setAttr(el, name, value);
      },
      toggleClass: (el, token, on) => {
        writes.push(`toggle ${token}`);
        browserDom.toggleClass(el, token, on);
      },
      swapClass: (el, next, prev) => {
        writes.push('swap');
        browserDom.swapClass(el, next, prev);
      },
    };
    return { dom, writes };
  }

  it('`h` adopts the list the server painted, and a change moves only its own tokens', () => {
    const values: Values = [true, 'a b', { class: 's' }];
    const [on, expr, o] = values;
    const { shadow } = mountAsDsd(FOREIGN, serverShadowHtml(foreignGraph, FOREIGN, { on, expr, o }));
    const { dom, writes } = counting();
    const ctl = controller(clientFactory(foreignGraph, FOREIGN), dom, shadow, values);
    ctl.h();
    expect(writes).toEqual([]);
    expect(classesIn(shadow)).toEqual({ tog: 'card activo', exp: 'a b', spr: 's', both: 'a b k' });

    for (const el of shadow.querySelectorAll('[id]')) el.classList.add('extra');
    ctl.u([, , false, 'b c', { class: 't' }]);
    // The swap knew what the server painted: `a` comes off although `h` wrote nothing.
    expect(classesIn(shadow)).toEqual({ tog: 'card extra', exp: 'b extra c', spr: 'extra t', both: 'b extra c' });
  });
});

describe('staticClass — what a static `class` keeps (rule 1)', () => {
  it('the literal as written when no token is toggled, an empty one included', () => {
    expect(staticClass('  a   b ', new Set(['c']))).toBe('  a   b ');
    expect(staticClass('', new Set(['c']))).toBe('');
  });

  it('the tokens left when some are, and nothing when all are', () => {
    expect(staticClass('a  b c', new Set(['b']))).toBe('a c');
    expect(staticClass('a', new Set(['a']))).toBeNull();
  });
});
