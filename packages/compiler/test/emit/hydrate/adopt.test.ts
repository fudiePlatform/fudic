// @vitest-environment happy-dom
/**
 * SDD-15 §6.14 — one controller, two adapters.
 *
 * The same `static c($props)` run against `SsrDom` produces markup the browser path adopts
 * WITHOUT MOVING A NODE. Equivalence (§6.7) says the two paths agree on the result; this
 * says the hydrate path never builds anything to get there — which is the property that
 * actually pays for itself, because a hydration that silently rebuilds looks identical in
 * the DOM and costs the whole point of DSD.
 */

import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { browserDom } from '@fudic/dom';
import { resolveComponents, type ComponentGraph } from '../../../src/emit/index.js';
import { fixturesDir, fixtureIo } from '../_support.js';
import {
  adoptOnly,
  clientFactory,
  controller,
  countingSteps,
  mountAsDsd,
  serverShadowHtml,
} from './_harness.js';

const graph: ComponentGraph = resolveComponents(join(fixturesDir, 'home.fud'), fixtureIo);
const values = ['Hola', 'highlight'] as const;

describe('hydrate adopts, it does not build', () => {
  const painted = serverShadowHtml(graph, 'app-card', { title: 'Hola', variant: 'highlight' });

  it('never calls element/text/append on the h path', () => {
    const { shadow } = mountAsDsd('app-card', painted);
    const ctl = controller(clientFactory(graph, 'app-card'), adoptOnly(browserDom), shadow, values);
    expect(() => ctl.h()).not.toThrow();
  });

  it('keeps the node identities the server markup produced', () => {
    const { shadow } = mountAsDsd('app-card', painted);
    const before = [...shadow.childNodes];
    const article = shadow.querySelector('article')!;
    const heading = shadow.querySelector('h2')!;

    controller(clientFactory(graph, 'app-card'), browserDom, shadow, values).h();

    expect([...shadow.childNodes]).toEqual(before); // same nodes, same order, by reference
    expect(shadow.querySelector('article')).toBe(article);
    expect(shadow.querySelector('h2')).toBe(heading);
  });

  it('walks by elements, entering every level that holds one', () => {
    const { shadow } = mountAsDsd('app-card', painted);
    const { dom, steps } = countingSteps(browserDom);
    controller(clientFactory(graph, 'app-card'), dom, shadow, values).h();

    // One `firstElementChild` per level that declares a cursor — the shadow, <article> and
    // <header>; <h2> holds only text, and `.body` is inside the branch that did not paint.
    // One `nextElementSibling` per element taken: <article>, <header>, <h2>, <app-button>.
    expect(steps.filter((s) => s === 'firstElementChild')).toHaveLength(3);
    expect(steps.filter((s) => s === 'nextElementSibling')).toHaveLength(4);
    expect(steps[0]).toBe('firstElementChild');
  });

  it('never counts nodes: the text between the elements is not on the path', () => {
    const { shadow } = mountAsDsd('app-card', painted);
    // The whitespace text nodes are there, and the walk is blind to them. That is the whole
    // point: two of them adjacent come back from the parser as ONE node, so any traversal
    // that counted nodes would land one off at that level and stay off.
    expect([...shadow.childNodes].filter((n) => n.nodeType === 3).length).toBeGreaterThan(0);

    const { dom, steps } = countingSteps(browserDom);
    controller(clientFactory(graph, 'app-card'), dom, shadow, values).h();
    expect(steps).not.toContain('nextSibling');
    expect(steps).not.toContain('firstChild');
    expect(steps).not.toContain('childAt');
  });

  it('reaches the interpolated run from the element beside it', () => {
    const { shadow } = mountAsDsd('app-card', painted);
    const { dom, steps } = countingSteps(browserDom);
    const ctl = controller(clientFactory(graph, 'app-card'), dom, shadow, values);
    ctl.h();

    // `@title` inside <h2>: found as the last node of its level, never counted to. The
    // other `lastChild` calls are the blocks taking their own trailing roots, which they
    // need in order to retire them (SDD-30 §3.2) — the mechanism is the same one.
    expect(steps).toContain('lastChild');
    expect(steps).not.toContain('childAt');
    expect(shadow.querySelector('h2')!.lastChild!.textContent).toBe('Hola');
  });
});

describe('one controller, two adapters — with hookup (§6.14)', () => {
  const rows = [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ];
  const painted = serverShadowHtml(graph, 'app-actions', { rows });

  it('the hookup leaves no trace in the HTML the server serializes', () => {
    // `$dom.event` / `$dom.bus` are no-ops in SSR and touch no node, so `renderToString`
    // cannot see them. The markup is the same one the client will adopt.
    expect(painted).toContain('class="both"');
    expect(painted).not.toContain('onclick');
    expect(painted).not.toContain('bus');
    expect(painted).not.toContain('$dom');
  });

  it('h() adopts that markup without building a node, listeners included', () => {
    const { shadow } = mountAsDsd('app-actions', painted);
    const ctl = controller(
      clientFactory(graph, 'app-actions'),
      adoptOnly(browserDom),
      shadow,
      [rows],
    );
    // `adoptOnly` forbids element/text/append: `s()` now does real work on this path, and
    // registering a listener must still not fabricate anything.
    expect(() => ctl.h()).not.toThrow();
  });
});
