// @vitest-environment happy-dom
/**
 * A name an `@{ }` declares is seen by everything after it, on the client as on the server
 * (SDD-85, decided with Pedro on 2026-11-16; `hoist.ts`).
 *
 * The server writes the template into one function. The client wrote the statement into `c`, `h`
 * and `u` separately, and a block is a function beside them: `@if (on) { <b>@x</b> }` after
 * `@{ let x = … }` threw `x is not defined` when it was created, and painted nothing.
 *
 * Proved on the running trees: created, hydrated and then updated, each one is what the server
 * paints for the same props.
 */

import { describe, expect, it } from 'vitest';
import { browserDom } from '@fudic/dom';
import { emitComponentClientModule, resolveComponents, type ComponentGraph } from '../../../src/emit/index.js';
import { memoryIo } from '../_support.js';
import { clientFactory, controller, mountAsDsd, serverShadowHtml } from './_harness.js';

const CODE =
  '@code {\n  const { on, name, rows } = props<{ on: boolean; name: string; rows: { id: number; tag: string }[] }>();\n}\n';

function graphOf(tag: string, template: string): ComponentGraph {
  return resolveComponents(
    '/page.fud',
    memoryIo({
      '/page.fud': `<link rel="component" href="./${tag}.fud">\n<html><head></head><body><${tag}></${tag}></body></html>\n`,
      [`/${tag}.fud`]: `${CODE}<${tag}>\n  <template shadowrootmode="open">${template}</template>\n</${tag}>\n`,
    }),
  );
}

interface Props {
  readonly on: boolean;
  readonly name: string;
  readonly rows: readonly { id: number; tag: string }[];
}
const values = (p: Props): unknown[] => [p.on, p.name, p.rows];

const STATES: readonly Props[] = [
  { on: true, name: 'Ana', rows: [{ id: 1, tag: 'a' }] },
  { on: false, name: 'Eva', rows: [] },
  { on: true, name: 'Luis', rows: [{ id: 2, tag: 'b' }, { id: 1, tag: 'c' }] },
];

const painted = (g: ComponentGraph, tag: string, p: Props): string =>
  mountAsDsd(tag, serverShadowHtml(g, tag, p)).shadow.innerHTML;

const SHAPES: readonly (readonly [string, string])[] = [
  ['a `let` read inside a block', '<p>@{ let x = name + "!"; }@if (on) {<b>@x</b>}</p>'],
  ['a `const` read by the header of a block', '<p>@{ const show = on && name !== ""; }@if (show) {<b>@name</b>}</p>'],
  ['a destructuring with a rest', '<p>@{ const { id, ...rest } = { id: name, tag: "t" }; }@if (on) {<b>@id @rest.tag</b>}</p>'],
  ['several declarators, one with no value', '<p>@{ let a = 1, b; b = a + 1; }@if (on) {<b>@a @b</b>}</p>'],
  ['an array pattern', '<p>@{ const [first] = [name]; }@if (on) {<b>@first</b>}</p>'],
  ['declared in a row, read by a block inside it', '<ul>@foreach (const r of rows) key (r.id) {<li>@{ const t = r.tag + name; }@if (on) {<b>@t</b>}</li>}</ul>'],
  ['a block of the author inside it stays the author\'s', '<p>@{ let n = 0; { let n2 = 2; n = n2; } }@if (on) {<b>@n</b>}</p>'],
  ['read after an element, outside it', '<div>@{ const inside = name; }<i>i</i></div><p>@if (on) {<b>@inside</b>}</p>'],
];

describe('a name an @{ } declares, seen by the blocks after it', () => {
  SHAPES.forEach(([label, template], n) => {
    const tag = `x-is-${n}`;
    const g = graphOf(tag, template);

    it(`${label}: created, then updated`, () => {
      for (const from of STATES) {
        const host = document.createElement(tag);
        const shadow = host.attachShadow({ mode: 'open' });
        document.body.append(host);
        const ctl = controller(clientFactory(g, tag), browserDom, shadow, values(from));
        ctl.c();
        expect(shadow.innerHTML).toBe(painted(g, tag, from));
        for (const to of STATES) {
          ctl.u([, , ...values(to)]);
          expect(shadow.innerHTML, JSON.stringify(to)).toBe(painted(g, tag, to));
        }
      }
    });

    it(`${label}: hydrated, then updated`, () => {
      for (const from of STATES) {
        const server = mountAsDsd(tag, serverShadowHtml(g, tag, from));
        const ctl = controller(clientFactory(g, tag), browserDom, server.shadow, values(from));
        ctl.h();
        for (const to of STATES) {
          ctl.u([, , ...values(to)]);
          expect(server.shadow.innerHTML, JSON.stringify(to)).toBe(painted(g, tag, to));
        }
      }
    });
  });

  it('declares the name once in the closure, and assigns it where the @{ } is', () => {
    const g = graphOf('x-is-code', '<p>@{ let x = name + "!"; }@if (on) {<b>@x</b>}</p>');
    const src = emitComponentClientModule(g, g.components.get('x-is-code')!);
    expect(src.match(/let x;/gu)).toHaveLength(1);
    expect(src).not.toContain('let x =');
    expect(src.match(/ x = name \+ "!"; /gu)).toHaveLength(3); // `c`, `h` and `u`
  });
});

describe('a typed declaration, lifted without its type', () => {
  // The harness runs the chunks as plain JS, so a typed one is checked on its text: the bundler
  // strips the type the author wrote, and an assignment cannot carry one.
  const typed = (template: string): string => {
    const g = graphOf('x-is-typed', template);
    return emitComponentClientModule(g, g.components.get('x-is-typed')!);
  };

  it('a name', () => {
    const src = typed('<p>@{ const label: string = name.toUpperCase(); }@if (on) {<b>@label</b>}</p>');
    expect(src).toContain('let label;');
    expect(src).toContain(' label = name.toUpperCase(); ');
  });

  it('a pattern, in parentheses', () => {
    const src = typed('<p>@{ const { tag }: { tag: string } = { tag: name }; }@if (on) {<b>@tag</b>}</p>');
    expect(src).toContain('let tag;');
    expect(src).toContain(' ({ tag } = { tag: name }); ');
  });
});
