// @vitest-environment happy-dom
/**
 * BUG-21 §6.15 and §6.16 — the two consumers of the item list that do not merely regenerate.
 *
 * Discarding a run changes the LIST the other two rules of the emit are evaluated over, and
 * both of them read the neighbours of an item:
 *
 *  - the ANCHOR of a construct is the variable of the next node of its level (SDD-30 §3.4).
 *    Drop that node and the block takes the next one, or `null` — append at the end.
 *  - the MARKER is written when two interpolated runs are separated by nothing but
 *    constructs (`marker.ts`). A whitespace run in between breaks that shape today; drop it
 *    and the shape appears, so a comment is emitted where none was.
 *
 * Both are correct, and both are changes of output nobody expects from reading the diff. They
 * are proved here rather than argued, and proved on the RUNNING trees: `h()` adopts with
 * construction forbidden, so a node either branch invented would throw instead of drifting.
 */

import { describe, expect, it } from 'vitest';
import { browserDom } from '@fudic/dom';
import {
  resolveComponents,
  emitComponentModule,
  emitComponentClientModule,
  type ComponentGraph,
} from '../../../src/emit/index.js';
import { memoryIo } from '../_support.js';
import { adoptOnly, clientFactory, controller, mountAsDsd, serverShadowHtml } from './_harness.js';

function graphOf(tag: string, source: string): ComponentGraph {
  return resolveComponents(
    '/page.fud',
    memoryIo({
      '/page.fud': `<link rel="component" href="./${tag}.fud">\n<html><head></head><body><${tag}></${tag}></body></html>\n`,
      [`/${tag}.fud`]: source,
    }),
  );
}

/** A component whose `<style>` declares `display`, around a template body. */
function graph(tag: string, display: string, code: string, markup: string): ComponentGraph {
  return graphOf(
    tag,
    `${code}<head>\n  <style>:host { display: ${display}; }</style>\n</head>\n\n` +
      `<${tag}>\n  <template shadowrootmode="open">${markup}</template>\n</${tag}>\n`,
  );
}

/** What the server painted, what `c()` built, and what `h()` holds after adopting. */
function trees(
  g: ComponentGraph,
  tag: string,
  props: Record<string, unknown>,
  values: readonly unknown[],
): { painted: string; created: string; hydrated: string } {
  const server = mountAsDsd(tag, serverShadowHtml(g, tag, props));
  const painted = server.shadow.innerHTML;

  const fresh = document.createElement(tag);
  const shadow = fresh.attachShadow({ mode: 'open' });
  document.body.append(fresh);
  controller(clientFactory(g, tag), browserDom, shadow, values).c();

  controller(clientFactory(g, tag), adoptOnly(browserDom), server.shadow, values).h();
  return { painted, created: shadow.innerHTML, hydrated: server.shadow.innerHTML };
}

const CODE = '@code {\n  const { on } = props<{ on: boolean }>();\n}\n';

describe('§6.15 — a construct with discardable whitespace on both sides', () => {
  // A flex container generates no box for a whitespace-only child, so all four runs of this
  // level go — including the two that were the block's neighbours.
  const g = graph('x-anchor', 'flex', CODE, '\n    <p>a</p>\n    @if (on) {<b>B</b>}\n    <p>z</p>\n  ');

  it('loses the runs on both sides of the construct', () => {
    expect(emitComponentModule(g, g.components.get('x-anchor')!)).not.toContain('$dom.text(" ")');
  });

  it('falls back to the NEXT anchor, or to null — insert at the end (§2.4)', () => {
    // A run that a construct in front needs as an anchor is given a variable. Drop that run
    // and the block takes what follows it; with nothing behind, `null` — append at the end.
    /** The anchor the level hands the construct: `$f0($branch, $anchor)`. */
    const anchor = (markup: string): string => {
      const g2 = graph('x-call', 'block', CODE, markup);
      const call = /\$f0\(([^)]*)\)/u.exec(emitComponentClientModule(g2, g2.components.get('x-call')!));
      return call![1]!.split(', ')[1]!;
    };
    // The trailing run is at the end of a block container, so it goes and the anchor with it.
    expect(anchor('<div>\n      <p>a</p>\n      @if (on) {<b>B</b>}\n    </div>')).toBe('null');
    // With a sibling behind, the run between the two is provable by nothing and stays — and
    // it is still the anchor, exactly as before this BUG.
    expect(anchor('<div>\n      <p>a</p>\n      @if (on) {<b>B</b>}\n      <p>z</p>\n    </div>')).toBe(
      '$n2',
    );
  });

  it('inserts in the right place, and the sibling behind it stays where it was', () => {
    for (const on of [true, false]) {
      const { painted, created, hydrated } = trees(g, 'x-anchor', { on }, [on]);
      expect(created).toBe(painted);
      expect(hydrated).toBe(painted);
      expect(painted).toBe(on ? '<p>a</p><b>B</b><p>z</p>' : '<p>a</p><p>z</p>');
    }
  });
});

describe('§6.16 — the marker, over the list the rule leaves behind', () => {
  const BODY = '@a @if (on) {<b>B</b>} @if (on) {<i>I</i>} @b';
  const CODE2 = '@code {\n  const { a, b, on } = props<{ a: string; b: string; on: boolean }>();\n}\n';

  /** Whether each branch writes the one comment the DOM ever gets. */
  function comments(g: ComponentGraph, tag: string): { server: boolean; client: boolean } {
    const comp = g.components.get(tag)!;
    return {
      server: emitComponentModule(g, comp).includes("$dom.comment('')"),
      client: emitComponentClientModule(g, comp).includes("$dom.comment('')"),
    };
  }

  it('is not written while a whitespace run separates the two constructs', () => {
    // In a block container that run is not provable — its neighbours are constructs, and
    // what a branch renders is not this BUG's to know — so the shape stays broken.
    const g = graph('x-blk', 'block', CODE2, BODY);
    expect(comments(g, 'x-blk')).toEqual({ server: false, client: false });
  });

  it('is written once the run between them goes, and by BOTH branches', () => {
    // The rule lives in the module both branches walk with, so this is not two decisions
    // that happen to agree: it is one. A marker on one side only is worse than none.
    const g = graph('x-flex', 'flex', CODE2, BODY);
    expect(comments(g, 'x-flex')).toEqual({ server: true, client: true });
  });

  it('is written for the same level with no whitespace in the source at all', () => {
    const g = graph('x-tight', 'block', CODE2, '@a @if (on) {<b>B</b>}@if (on) {<i>I</i>} @b');
    expect(comments(g, 'x-tight')).toEqual({ server: true, client: true });
  });

  it('and h() finds it: the tree it adopts is the one the server painted', () => {
    const g = graph('x-flex2', 'flex', CODE2, BODY);
    for (const on of [true, false]) {
      const props = { a: 'A', b: 'Z', on };
      const { painted, created, hydrated } = trees(g, 'x-flex2', props, ['A', 'Z', on]);
      expect(created).toBe(painted);
      expect(hydrated).toBe(painted);
      expect(painted).toContain('<!---->');
    }
  });
});
