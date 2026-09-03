/**
 * BUG-21 §6.4–§6.9 — the rule, on what the two branches actually emit.
 *
 * `display.test.ts` proves the module that reads the boxes; this proves the decision that
 * reads it: a whitespace-only run is emitted unless the emit can PROVE it renders nothing,
 * the three guards go first, and `unknown` conserves.
 *
 * Every case asserts the SERVER and the CLIENT counts together, and that is not thoroughness
 * — it is the invariant of §4.5. A node one branch drops and the other builds is worse than a
 * node neither drops: the two trees stop being the same tree, and `h()` adopts one it does not
 * recognise. The rule lives in `emitItems`, the one module both branches walk their children
 * with, so these numbers cannot come apart without the decision having moved somewhere else.
 */

import { describe, expect, it } from 'vitest';
import {
  resolveComponents,
  emitComponentModule,
  emitComponentClientModule,
  emitPageModule,
  type ComponentGraph,
} from '../../src/emit/index.js';
import { memoryIo } from './_support.js';

/**
 * `$dom.text(...)` calls whose argument is nothing but whitespace — the nodes this BUG is
 * about. An interpolated run is fabricated as `$dom.text('')` and filled by `$a()`, so the
 * empty string is deliberately NOT counted: that node exists and has to (§2.5).
 */
const TEXT_CALL = /\$dom\.text\((?:'([^']*)'|"((?:[^"\\]|\\.)*)")\)/gu;

function blanks(code: string): number {
  let n = 0;
  for (const call of code.matchAll(TEXT_CALL)) {
    const raw = call[1] ?? call[2] ?? '';
    if (raw !== '' && /^(?:\\n|\\t|\\r|\\f| )+$/u.test(raw)) n += 1;
  }
  return n;
}

/** A component `.fud`, with an optional `<style>`, around a template body. */
function component(tag: string, template: string, css?: string): string {
  const head = css === undefined ? '' : `<head>\n  <style>${css}</style>\n</head>\n\n`;
  return `${head}<${tag}>\n  <template shadowrootmode="open">${template}</template>\n</${tag}>\n`;
}

/** The graph of a page that uses every component given, keyed by tag. */
function graphOf(components: Record<string, string>, pageBody = '', pageHead = ''): ComponentGraph {
  const links = Object.keys(components)
    .map((tag) => `<link rel="component" href="./${tag}.fud">`)
    .join('');
  const files: Record<string, string> = {
    '/page.fud': `<!DOCTYPE html>\n<html><head>${links}${pageHead}</head><body>${pageBody}</body></html>\n`,
  };
  for (const [tag, source] of Object.entries(components)) files[`/${tag}.fud`] = source;
  return resolveComponents('/page.fud', memoryIo(files));
}

/**
 * The whitespace nodes ONE component emits, counted on both branches. They are asserted as a
 * pair everywhere below: the number is the point, and its equality is the invariant.
 */
function count(graph: ComponentGraph, tag: string): { server: number; client: number } {
  const comp = graph.components.get(tag)!;
  return {
    server: blanks(emitComponentModule(graph, comp)),
    client: blanks(emitComponentClientModule(graph, comp)),
  };
}

/** The same, for a single-component graph written inline. */
function blanksOf(template: string, css?: string, tag = 'app-x'): { server: number; client: number } {
  return count(graphOf({ [tag]: component(tag, template, css) }), tag);
}

describe('§6.4 — the borders of a shadow root, which are the first two nodes of any component', () => {
  const TEMPLATE = '\n    <div>hola</div>\n  ';

  it('discards them when the component declares a block :host', () => {
    // The edge of a block container is always the edge of a line, and collapsible
    // whitespace at the edge of a line is removed. Nothing here is a heuristic about tags.
    expect(blanksOf(TEMPLATE, ':host { display: block; }')).toEqual({ server: 0, client: 0 });
  });

  it('keeps them when it declares none: a custom element is inline by default', () => {
    // The negative case, and it is the one that says this is a proof and not a preference.
    expect(blanksOf(TEMPLATE, ':host { color: red; }')).toEqual({ server: 2, client: 2 });
    expect(blanksOf(TEMPLATE)).toEqual({ server: 2, client: 2 });
  });

  it('keeps them when the :host is inline, and drops them when it is inline-block', () => {
    expect(blanksOf(TEMPLATE, ':host { display: inline; }')).toEqual({ server: 2, client: 2 });
    // Inline-block is inline-level OUTSIDE and a block container INSIDE — which is what
    // app-badge and app-button declare, and why they lose their two border nodes.
    expect(blanksOf(TEMPLATE, ':host { display: inline-block; }')).toEqual({ server: 0, client: 0 });
  });

  it('discards every whitespace child of a flex container, which generates no box for one', () => {
    // Proof (a), the strongest of the three: it looks at no neighbour at all.
    const flex = '\n    <span>a</span>\n    <span>b</span>\n  ';
    expect(blanksOf(flex, ':host { display: flex; }')).toEqual({ server: 0, client: 0 });
    expect(blanksOf(flex, ':host { display: grid; }')).toEqual({ server: 0, client: 0 });
  });
});

describe('§6.5 — between two boxes, and it is the display that decides, not the newline', () => {
  const css = ':host { display: block; }';

  it('discards the whitespace between two block elements', () => {
    // No line for it to fall on: neither box puts it in one.
    expect(blanksOf('\n    <p>a</p>\n    <p>b</p>\n  ', css)).toEqual({ server: 0, client: 0 });
  });

  it('keeps the whitespace beside a <span>, which is the SAME whitespace', () => {
    // The two files differ in nothing but the tag. This is the case an external minifier
    // deletes and the browser renders — the space between «a» and «b».
    expect(blanksOf('\n    <span>a</span>\n    <span>b</span>\n  ', css)).toEqual({
      server: 1,
      client: 1,
    });
  });

  it('keeps it beside a construct, whose first box is not this BUG’s to know (§7)', () => {
    const src = '\n    <p>a</p>\n    @if (true) {\n      <p>b</p>\n    }\n  ';
    // Two survive, and each says something. The one between `</p>` and the `@if` is kept
    // because what a branch starts with — and whether it renders at all — is a question with
    // its own BUG (§7). The one that opens the body is kept because the body is at the
    // container's edge only when nothing of the level renders before it, and `<p>a</p>` does.
    // What DOES go: the two borders of the shadow root, and the run that closes the body,
    // which is the end of the container because the construct is the last item of its level.
    expect(blanksOf(src, css)).toEqual({ server: 2, client: 2 });
  });
});

describe('§6.6 — the criterion of §2.3: the graph, not a list of tags', () => {
  // Two components in memory that differ in ONE line of CSS, used the same way by the same
  // parent. `<app-kid>` is in no minifier's tag list; here its `<style>` is right there.
  const parent = component(
    'app-host',
    '\n    <div><p>x</p> <app-kid></app-kid> <p>y</p></div>\n  ',
    ':host { display: block; }',
  );
  const kid = (display: string): string =>
    component('app-kid', '<b>k</b>', `:host { display: ${display}; }`);

  it('keeps the whitespace glued to a child that declares inline-block', () => {
    const graph = graphOf({ 'app-host': parent, 'app-kid': kid('inline-block') });
    expect(count(graph, 'app-host')).toEqual({ server: 2, client: 2 });
  });

  it('discards it when the same child declares block', () => {
    const graph = graphOf({ 'app-host': parent, 'app-kid': kid('block') });
    expect(count(graph, 'app-host')).toEqual({ server: 0, client: 0 });
  });

  it('keeps it when the child declares no display at all', () => {
    const graph = graphOf({ 'app-host': parent, 'app-kid': component('app-kid', '<b>k</b>') });
    expect(count(graph, 'app-host')).toEqual({ server: 2, client: 2 });
  });
});

describe('§4.3.c — a display outside :host poisons the tag table for the whole file', () => {
  it('keeps everything a poisoned file could otherwise prove about a known tag', () => {
    const src = '\n    <div><p>a</p>\n    <p>b</p></div>\n  ';
    // Without a rule tree (SDD-09 §7) there is no telling which element `.row` selects, so
    // every known tag of the file drops to `unknown`. `:host` is still read: it is a rule
    // about the host itself, and the two border nodes still go.
    expect(blanksOf(src, ':host { display: block; } .row { display: flex; }')).toEqual({
      server: 1,
      client: 1,
    });
    expect(blanksOf(src, ':host { display: block; }')).toEqual({ server: 0, client: 0 });
  });

  it('reads the page’s own <head> styles for the same question', () => {
    // The `<app-x>` in the middle is there to be ASKED: on a page too, the display of a
    // component tag comes from the graph and not from any table (§4.3.b).
    const body = '\n    <div>\n      <p>a</p> <app-x></app-x>\n      <p>b</p>\n    </div>\n  ';
    const page = (head: string): ComponentGraph =>
      graphOf({ 'app-x': component('app-x', '<b>x</b>', ':host { display: block; }') }, body, head);
    // A `<body>` is a block container and a `<div>` is a block box, so the page's six runs
    // are all provable — until the page's own sheet declares a display, and then the four
    // that depend on the tag table are not. The `<body>` keeps its two: the module fabricates
    // it itself, which is the same standing the `:host` of a component has.
    expect(blanks(emitPageModule(page('')))).toBe(0);
    expect(blanks(emitPageModule(page('<style>.row { display: flex; }</style>')))).toBe(4);
  });
});

describe('§6.7 — slots: the guard BUG-07 named first, and it admits no exception', () => {
  it('keeps the light DOM of a host even where all three proofs hold', () => {
    const graph = graphOf({
      'app-host': component(
        'app-host',
        '\n    <app-kid>\n      <p>a</p>\n      <p>b</p>\n    </app-kid>\n  ',
        ':host { display: block; }',
      ),
      'app-kid': component('app-kid', '<slot></slot>', ':host { display: block; }'),
    });
    // Three block-level neighbours in a block container, and not one of the three runs goes:
    // a whitespace node counts as ASSIGNED CONTENT, so dropping one makes a filled `<slot>`
    // show its fallback.
    expect(count(graph, 'app-host')).toEqual({ server: 3, client: 3 });
  });

  it('keeps the children of a <slot>, which are its fallback', () => {
    const src = '\n    <div>\n      <slot>\n        <p>none</p>\n      </slot>\n    </div>\n  ';
    // The `<div>` loses its two edges; the two inside the `<slot>` stay.
    expect(blanksOf(src, ':host { display: block; }')).toEqual({ server: 2, client: 2 });
  });
});

describe('§6.8 — `:empty`, asked of the result', () => {
  it('keeps the node of <div>\\n</div>: emptying it is a rule that starts applying', () => {
    expect(blanksOf('\n    <div>\n    </div>\n  ', ':host { display: block; }')).toEqual({
      server: 1,
      client: 1,
    });
  });

  it('keeps the LAST one when every child of an element is discardable', () => {
    // Both runs are at an edge of a block container, so both are provable — and the check is
    // on the result, so the last one is not.
    const src = '\n    <div>\n      <span>a</span>\n    </div>\n  ';
    expect(blanksOf(src, ':host { display: block; }')).toEqual({ server: 0, client: 0 });
    const empty = '\n    <div>\n      <!-- nothing -->\n    </div>\n  ';
    // An author comment reaches neither branch's output, so it does not pass for content.
    expect(blanksOf(empty, ':host { display: block; }')).toEqual({ server: 1, client: 1 });
  });
});

describe('§6.9 — preserve: the mode is decided first and nothing here touches it', () => {
  it('loses nothing inside a <pre> or a <textarea>', () => {
    const pre = '\n    <pre>\n      <span>a</span>\n    </pre>\n  ';
    // The `<pre>`'s own two runs survive; the shadow root's two borders still go.
    expect(blanksOf(pre, ':host { display: block; }')).toEqual({ server: 2, client: 2 });
    const area = '\n    <textarea>\n    </textarea>\n  ';
    expect(blanksOf(area, ':host { display: block; }')).toEqual({ server: 1, client: 1 });
  });

  it('loses nothing under data-fud-space="preserve"', () => {
    const src = '\n    <div data-fud-space="preserve">\n      <p>a</p>\n      <p>b</p>\n    </div>\n  ';
    expect(blanksOf(src, ':host { display: block; }')).toEqual({ server: 3, client: 3 });
  });

  it('loses nothing when the component’s own <style> preserves white-space', () => {
    const src = '\n    <div>\n      <p>a</p>\n      <p>b</p>\n    </div>\n  ';
    expect(blanksOf(src, ':host { display: block; white-space: pre-wrap; }')).toEqual({
      server: 5,
      client: 5,
    });
  });
});

describe('the run that is not blank is not this rule’s business (§4.6)', () => {
  it('never touches a run with a character in it, or one with a hole', () => {
    const src = '\n    <p>a</p>\n    texto\n    <p>b</p>\n  ';
    // Three runs, one of which carries `texto`: the two blank ones are between two blocks
    // and a block and a run — and a run is not a box, so neither of them is provable.
    expect(blanksOf(src, ':host { display: block; }')).toEqual({ server: 0, client: 0 });
    expect(emitComponentModule(
      graphOf({ 'app-x': component('app-x', src, ':host { display: block; }') }),
      graphOf({ 'app-x': component('app-x', src, ':host { display: block; }') }).components.get('app-x')!,
    )).toContain('texto');
  });

  it('does not mistake an entity for formatting: &#32; is a space the author named', () => {
    const src = '\n    <p>a</p>\n    &#32;\n    <p>b</p>\n  ';
    // Read off the RAW source, before entities are decoded: a node that spells its own
    // content is content, and it is emitted as the space it spells.
    const graph = graphOf({ 'app-x': component('app-x', src, ':host { display: block; }') });
    // Collapsed first and decoded after, so the run reaching the output is the space the
    // author named with its two collapsed neighbours around it — one node, and it survives.
    expect(emitComponentModule(graph, graph.components.get('app-x')!)).toContain('$dom.text("   ")');
    expect(count(graph, 'app-x')).toEqual({ server: 1, client: 1 });
  });
});
