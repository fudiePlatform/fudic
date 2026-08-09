// @vitest-environment happy-dom
/**
 * SDD-30 §6.17 and §6.19 — the server's tree and the client's, with blocks in between.
 *
 * A block is the one construct where the two branches can diverge without either looking
 * wrong: the server decides a condition once and paints the result, the client decides it
 * again and has to land on the very nodes that decision produced. The element cursor is what
 * keeps them in step, and a block that renders nothing has to hand it back untouched.
 *
 * Every case runs `h()` with construction FORBIDDEN (`adoptOnly`): if a single `element`,
 * `text` or `append` fires, the branch is building what the server already painted, and the
 * trees have started to drift.
 */

import { describe, expect, it } from 'vitest';
import { browserDom } from '@fudic/dom';
import { resolveComponents, type ComponentGraph } from '../../../src/emit/index.js';
import { memoryIo } from '../_support.js';
import { adoptOnly, clientFactory, controller, mountAsDsd, serverShadowHtml } from './_harness.js';

const wrap = (tag: string, code: string, markup: string): string =>
  `${code}<${tag}>\n  <template shadowrootmode="open">${markup}</template>\n</${tag}>\n`;

/** An `@if` and a keyed `@foreach` at the same level, both driven by props. */
const MIXED = wrap(
  'x-mix',
  '@code {\n  const { on, rows } = props<{ on: boolean; rows: string[] }>();\n}\n',
  '<section><h1>t</h1>@if (on) {<b>open</b>}<ul>@foreach (const r of rows) key (r) {<li>@r</li>}</ul></section>',
);

/** The shape §3.4 cannot resolve with an anchor: two interpolated runs, a block between. */
const ANCHORED = wrap(
  'x-anchor',
  '@code {\n  const { a, b, on } = props<{ a: string; b: string; on: boolean }>();\n}\n',
  '<div>@a @if (on) {<b>B</b>} @b</div>',
);

function graphOf(tag: string, source: string): ComponentGraph {
  return resolveComponents(
    '/page.fud',
    memoryIo({
      '/page.fud': `<link rel="component" href="./${tag}.fud">\n<html><head></head><body><${tag}></${tag}></body></html>\n`,
      [`/${tag}.fud`]: source,
    }),
  );
}

/**
 * The three trees for one set of props: what the server painted, what `c()` builds, and
 * what `h()` is left holding after adopting the server's.
 */
function trees(
  graph: ComponentGraph,
  tag: string,
  props: Record<string, unknown>,
  values: readonly unknown[],
): { painted: string; created: string; hydrated: string } {
  const server = mountAsDsd(tag, serverShadowHtml(graph, tag, props));
  const painted = server.shadow.innerHTML; // before anything adopts it

  const fresh = document.createElement(tag);
  const shadow = fresh.attachShadow({ mode: 'open' });
  document.body.append(fresh);
  controller(clientFactory(graph, tag), browserDom, shadow, values).c();

  controller(clientFactory(graph, tag), adoptOnly(browserDom), server.shadow, values).h();
  return { painted, created: shadow.innerHTML, hydrated: server.shadow.innerHTML };
}

describe('create ↔ hydrate with blocks (§6.17)', () => {
  const graph = graphOf('x-mix', MIXED);

  const cases: [string, Record<string, unknown>, readonly unknown[]][] = [
    ['@if closed, no rows', { on: false, rows: [] }, [false, []]],
    ['@if open, no rows', { on: true, rows: [] }, [true, []]],
    ['@if closed, one row', { on: false, rows: ['a'] }, [false, ['a']]],
    ['@if open, one row', { on: true, rows: ['a'] }, [true, ['a']]],
    ['@if open, three rows', { on: true, rows: ['a', 'b', 'c'] }, [true, ['a', 'b', 'c']]],
    ['@if closed, three rows', { on: false, rows: ['a', 'b', 'c'] }, [false, ['a', 'b', 'c']]],
  ];

  for (const [name, props, values] of cases) {
    it(`agrees with ${name}`, () => {
      const t = trees(graph, 'x-mix', props, values);
      expect(t.created).toBe(t.painted);
      expect(t.hydrated).toBe(t.painted);
    });
  }

  it('really did render the branches it claims to', () => {
    // A comparison of two empty strings would pass every case above without proving one.
    expect(trees(graph, 'x-mix', { on: true, rows: ['a', 'b'] }, [true, ['a', 'b']]).painted)
      .toContain('<b>open</b><ul><li>a</li><li>b</li></ul>');
    expect(trees(graph, 'x-mix', { on: false, rows: [] }, [false, []]).painted)
      .toContain('<h1>t</h1><ul></ul>');
  });
});

/**
 * BUG-19 §6.11–§6.14 — the three constructs the server did not paint at all.
 *
 * This is the test the defect survived for lack of: the harness above only ever wrote `@if`
 * and `@foreach`, so a `@switch` whose body reached no output looked exactly like a `@switch`
 * that rendered nothing. Every case here ends in a SIBLING element, because a block that
 * paints nothing has to hand the cursor back untouched (§4.3) — and the sibling is the only
 * witness of that.
 */
const SWITCH = wrap(
  'x-sw',
  '@code {\n  const { kind } = props<{ kind: string }>();\n}\n',
  "<section><h1>t</h1>@switch (kind) { case 'a': <p>A</p> default: <i>D</i> }<hr></section>",
);

/** No `default`: with nothing matching, the construct paints nothing at all. */
const SWITCH_BARE = wrap(
  'x-sw0',
  '@code {\n  const { kind } = props<{ kind: string }>();\n}\n',
  "<section><h1>t</h1>@switch (kind) { case 'a': <p>A</p> }<hr></section>",
);

const FOR = wrap(
  'x-forq',
  '@code {\n  const { n } = props<{ n: number }>();\n}\n',
  '<section>@for (let i = 0; i < n; i++) {<b>@i</b>}<hr></section>',
);

/**
 * A `@while` needs something that changes, and props are all it can reach here — hence the
 * countdown box. Each render pass gets its OWN, which is what `treesFresh` is for: `c()` and
 * `h()` are two independent renders of the same state, not one continued.
 */
const WHILE = wrap(
  'x-whileq',
  '@code {\n  const { box } = props<{ box: { n: number } }>();\n}\n',
  '<section>@while (box.n-- > 0) {<b>w</b>}<hr></section>',
);

/** As `trees`, with the props and the values rebuilt per pass (a `@while` consumes them). */
function treesFresh(
  graph: ComponentGraph,
  tag: string,
  props: () => Record<string, unknown>,
  values: () => readonly unknown[],
): { painted: string; created: string; hydrated: string } {
  const server = mountAsDsd(tag, serverShadowHtml(graph, tag, props()));
  const painted = server.shadow.innerHTML;

  const fresh = document.createElement(tag);
  const shadow = fresh.attachShadow({ mode: 'open' });
  document.body.append(fresh);
  controller(clientFactory(graph, tag), browserDom, shadow, values()).c();

  controller(clientFactory(graph, tag), adoptOnly(browserDom), server.shadow, values()).h();
  return { painted, created: shadow.innerHTML, hydrated: server.shadow.innerHTML };
}

describe('@switch, hydrated (§6.11)', () => {
  const graph = graphOf('x-sw', SWITCH);

  it('agrees with the case arm taken', () => {
    const t = trees(graph, 'x-sw', { kind: 'a' }, ['a']);
    expect(t.painted).toContain('<p>A</p>');
    expect(t.created).toBe(t.painted);
    expect(t.hydrated).toBe(t.painted);
  });

  it('agrees with the default arm taken', () => {
    const t = trees(graph, 'x-sw', { kind: 'zzz' }, ['zzz']);
    expect(t.painted).toContain('<i>D</i>');
    expect(t.created).toBe(t.painted);
    expect(t.hydrated).toBe(t.painted);
  });

  it('agrees with no arm at all, and the sibling behind it is still adopted (§6.14)', () => {
    const bare = graphOf('x-sw0', SWITCH_BARE);
    const t = trees(bare, 'x-sw0', { kind: 'zzz' }, ['zzz']);
    expect(t.painted).toContain('<h1>t</h1><hr>'); // nothing between them: the cursor did not move
    expect(t.created).toBe(t.painted);
    expect(t.hydrated).toBe(t.painted);
  });
});

describe('@for, hydrated (§6.12)', () => {
  const graph = graphOf('x-forq', FOR);

  for (const n of [0, 1, 3]) {
    it(`agrees with ${n} turn(s)`, () => {
      const t = trees(graph, 'x-forq', { n }, [n]);
      expect(t.painted).toContain('<hr>'); // the sibling survives every turn count (§6.14)
      expect((t.painted.match(/<b>/gu) ?? []).length).toBe(n);
      expect(t.created).toBe(t.painted);
      expect(t.hydrated).toBe(t.painted);
    });
  }
});

describe('@while, hydrated (§6.13)', () => {
  const graph = graphOf('x-whileq', WHILE);

  for (const n of [0, 3]) {
    it(`agrees with ${n} turn(s)`, () => {
      const t = treesFresh(graph, 'x-whileq', () => ({ box: { n } }), () => [{ n }]);
      expect(t.painted).toContain('<hr>');
      expect((t.painted.match(/<b>w<\/b>/gu) ?? []).length).toBe(n);
      expect(t.created).toBe(t.painted);
      expect(t.hydrated).toBe(t.painted);
    });
  }
});

describe('the anchor §3.4 forces, hydrated (§6.19)', () => {
  const graph = graphOf('x-anchor', ANCHORED);

  it('adopts both runs with the block closed — one text node in the markup, two in the tree', () => {
    // This is the shape the anchor cannot resolve: with the block rendering nothing, the
    // two interpolated runs come back from HTML as a SINGLE text node, and no traversal
    // tells one from the other. The empty comment is the boundary the markup lost.
    const t = trees(graph, 'x-anchor', { a: 'A', b: 'B', on: false }, ['A', 'B', false]);
    expect(t.created).toBe(t.painted);
    expect(t.hydrated).toBe(t.painted);
    expect(t.painted).toContain('<!---->');
  });

  it('adopts both runs with the block open', () => {
    const t = trees(graph, 'x-anchor', { a: 'A', b: 'B', on: true }, ['A', 'B', true]);
    expect(t.created).toBe(t.painted);
    expect(t.hydrated).toBe(t.painted);
    expect(t.painted).toContain('<b>B</b>');
  });

  it('rewrites each run on its own after hydrating, not one over the other', () => {
    // The point of the marker: `$a()` has to find TWO nodes. If the adopt path had landed
    // both variables on the same text node, an update would write one value over the other
    // and the second run would vanish.
    const server = mountAsDsd('x-anchor', serverShadowHtml(graph, 'x-anchor', { a: 'A', b: 'B', on: false }));
    const ctl = controller(clientFactory(graph, 'x-anchor'), browserDom, server.shadow, ['A', 'B', false]);
    ctl.h();
    ctl.u!([, , 'X', 'Y', false]);
    expect(server.shadow.textContent).toContain('X');
    expect(server.shadow.textContent).toContain('Y');
  });
});
