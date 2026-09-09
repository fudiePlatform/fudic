/**
 * `@{ … }` — the inline code block (decisions 13, 16, 17), and the `@while` that depends on it.
 *
 * The token has existed since SDD-03 and the AST node since SDD-05. What was missing was the
 * emit: both branches filed it under "author JS, hoisted by `module.ts`", which is true of
 * `@code`, whose region IS the module, and false of this one — it is hoisted nowhere, so it
 * ran nowhere. The block was parsed, carried through the whole pipeline, and dropped without
 * a diagnostic.
 *
 * The construct that pays for that is `@while`. It is the one loop whose header declares no
 * iteration variable, so its cursor lives outside the block and the BODY has to advance it —
 * `@{ cur = cur.next; }`, exactly as the canonical example of decision 91 writes it. With the
 * block dropped, nothing advanced and the header looped forever, fabricating a DOM node per
 * turn. It was not a `@while` that reconciled badly; it was a `@while` nobody could write.
 */

import { describe, expect, it } from 'vitest';
import {
  resolveComponents,
  emitComponentModule,
  emitComponentClientModule,
} from '../../src/emit/index.js';
import { memoryIo } from './_support.js';

function graphOf(code: string, template: string) {
  const io = memoryIo({
    '/page.fud':
      '<link rel="component" href="./x-own.fud">\n' +
      '<html><head></head><body><x-own></x-own></body></html>\n',
    '/x-own.fud':
      `@code {\n${code}}\n` +
      `<x-own>\n  <template shadowrootmode="open">${template}</template>\n</x-own>\n`,
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

/** The three bodies a statement can land in, sliced out of the emitted factory. */
const between = (src: string, from: string, to: string): string =>
  src.slice(src.indexOf(from), src.indexOf(to));

const SEEN = '  let marca = 1;\n';
const TEMPLATE = '@{ marca = 3; }<p>@marca</p>';

describe('@{ … } — the author JS that runs in place', () => {
  it('the SERVER runs it, in document order, before the run that reads it', () => {
    const src = server(SEEN, TEMPLATE);
    expect(src).toContain('marca = 3;');
    // Order is the whole contract: a block that ran after the interpolation would paint the
    // value it was written to change.
    expect(src.indexOf('marca = 3;')).toBeLessThan(src.indexOf('String((marca)'));
  });

  it('the CLIENT runs it while fabricating and while adopting', () => {
    const src = client(SEEN, TEMPLATE);
    expect(between(src, 'c: () => {', 'h: () => {')).toContain('marca = 3;');
    // `h` too, and that is not symmetry for its own sake: the block leaves the surrounding
    // scope in the state the rest of the walk reads, so an instance that came alive by
    // hydrating would otherwise hold different variables from one that was created.
    expect(between(src, 'h: () => {', 'u: (')).toContain('marca = 3;');
  });

  it('and again in the update pass, because that pass is a render too', () => {
    const src = client(
      '  let marca = 1;\n  @client {\n    import { signal } from "@fudic/core";\n' +
        '    const n = signal(0);\n  }\n',
      '<b>@(n())</b>@{ marca = 3; }<p>@marca</p>',
    );
    expect(src).toContain('const $u = () => { $a(); marca = 3; };');
  });

  it('emits nothing for a template that has none', () => {
    const src = client(SEEN, '<p>@marca</p>');
    expect(src).not.toContain('marca = 3');
  });
});

const LISTA =
  '  type Nodo = { id: string; n: number; next: Nodo | null };\n' +
  '  const lista: Nodo = { id: "a", n: 1, next: null };\n' +
  '  let cur: Nodo | null = lista;\n';

const WALK =
  '@{ cur = lista; }<ul>@while (cur !== null) key (cur.id) {<li>@cur.n</li>@{ cur = cur.next; }}</ul>';

describe('the canonical @while of decision 91', () => {
  it('the SERVER walk advances the cursor inside the loop', () => {
    const src = server(LISTA, WALK);
    expect(src).toContain('while (cur !== null) {');
    expect(src).toContain('cur = cur.next;');
  });

  it('the cursor is NOT a parameter of the block: a parameter swallows the write', () => {
    // `cur` is changeable and free in the body, so the dependency rule would hand it over —
    // and then `cur = cur.next` would move the parameter, the header would read the same
    // node forever, and the loop would never end. A name the body ASSIGNS is shared state,
    // so it is reached through the closure instead.
    const src = client(LISTA, WALK);
    expect(src).toContain('const $b0 = ($parent, $anchor) => {');
    expect(src).not.toContain('const $b0 = ($parent, $anchor, cur)');
  });

  it('advances behind BOTH doors of the reconciliation, `c()` and `u()`', () => {
    // The reconciliation reaches a row through a key it already has (`u`) or one it does not
    // (`c`). An advance behind only one makes the header read the same cursor twice: the hit
    // that did not move it makes the next turn miss the key it just deleted, build a
    // duplicate, and only then move on — three rows come back as five.
    const src = client(LISTA, WALK);
    const block = between(src, 'const $b0 = ($parent, $anchor) => {', 'const $u0 = () => {');
    const create = between(block, 'c: () => {', 'h: ($c) => {');
    const update = between(block, 'u: (', 'move: (');
    expect(create).toContain('cur = cur.next;');
    expect(update).toContain('cur = cur.next;');
  });

  it('the seed runs ahead of the reconciliation, so the header starts over', () => {
    // A `@while` terminates by CONSUMING state, so by the second pass that state is spent:
    // `while (cur !== null)` with `cur` already `null` gives zero rows and retires every one
    // that was alive. The seed is what makes the pass repeatable, and it is the author's to
    // write — in the template, where the emit can put it in the update body.
    const src = client(LISTA, WALK);
    expect(src).toContain('u: () => { $a(); cur = lista; $u0(); },');
  });
});
