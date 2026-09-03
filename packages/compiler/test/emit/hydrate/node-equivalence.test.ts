// @vitest-environment happy-dom
/**
 * BUG-21 §6.14 — the tree the server serializes and the tree `c()` fabricates have the same
 * number of nodes, for every fixture, and `h()` adopts without fabricating one.
 *
 * It is the test that makes it impossible for the rule to enter by ONE branch. Written in the
 * form the BUG asks for — counted, not compared as text — because that is the failure it has
 * to catch: a node dropped on one side and built on the other is a hydration whose variables
 * point at the wrong nodes from that level down, and every one of those trees still looks
 * perfectly reasonable read on its own.
 *
 * `adoptOnly` is what proves the second half: on the hydrate path `element`, `text` and
 * `append` throw, so a branch that fabricated anything fails here instead of drifting.
 */

import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { browserDom } from '@fudic/dom';
import { resolveComponents, type ComponentGraph } from '../../../src/emit/index.js';
import { fixturesDir, fixtureIo } from '../_support.js';
import { adoptOnly, clientFactory, controller, mountAsDsd, serverShadowHtml } from './_harness.js';

const graph: ComponentGraph = resolveComponents(join(fixturesDir, 'home.fud'), fixtureIo);

/**
 * Every node of a tree, shadow roots of DESCENDANTS excluded: a child's shadow is filled by
 * the server because it renders the whole page and left to the runtime by the client (SDD-17),
 * so the count is taken over exactly the nodes both sides own.
 */
function nodes(root: ParentNode): number {
  let n = 0;
  for (const child of root.childNodes) {
    n += 1;
    n += nodes(child as ParentNode);
  }
  return n;
}

/**
 * The one attribute the two branches are MEANT to disagree on: `data-fud-id` is identity of
 * PAGE, assigned by the server while rendering (SDD-15 §3.1).
 */
const withoutIds = (html: string): string => html.replace(/ data-fud-id="\d+"/gu, '');

/** The three trees for one set of props: painted, created, and what `h()` is left holding. */
function three(tag: string, props: Record<string, unknown>, values: readonly unknown[]): {
  painted: string;
  created: string;
  hydrated: string;
  paintedNodes: number;
} {
  const server = mountAsDsd(tag, serverShadowHtml(graph, tag, props));
  const painted = server.shadow.innerHTML;
  const paintedNodes = nodes(server.shadow);

  const fresh = document.createElement(tag);
  const shadow = fresh.attachShadow({ mode: 'open' });
  document.body.append(fresh);
  controller(clientFactory(graph, tag), browserDom, shadow, values).c();

  // Construction forbidden: `h()` adopts what the server painted or it throws.
  controller(clientFactory(graph, tag), adoptOnly(browserDom), server.shadow, values).h();
  return { painted, created: shadow.innerHTML, hydrated: server.shadow.innerHTML, paintedNodes };
}

const CASES: [string, Record<string, unknown>, readonly unknown[]][] = [
  ['app-badge', { tone: 'success' }, ['success']],
  ['app-badge', {}, [undefined]],
  ['app-button', { variant: 'ghost', disabled: true }, ['ghost', true]],
  ['app-card', { title: 'Hola', variant: 'highlight' }, ['Hola', 'highlight']],
  ['app-list', { rows: [], empty: 'nada' }, [[], 'nada']],
  ['app-list', { rows: [{ id: 'a', label: 'A', tags: ['x', 'y'] }] }, [[{ id: 'a', label: 'A', tags: ['x', 'y'] }], undefined]],
  ['app-actions', { rows: [{ id: 'a', label: 'A' }] }, [[{ id: 'a', label: 'A' }]]],
  ['app-actions', { rows: [] }, [[]]],
];

describe('§6.14 — the same tree on both branches, fixture by fixture', () => {
  for (const [tag, props, values] of CASES) {
    it(`${tag} ${JSON.stringify(props)}`, () => {
      const { painted, created, hydrated } = three(tag, props, values);
      // Compared as MARKUP and not as a node count, and that is not a weaker assertion — it
      // is the honest one. Text has no boundary in HTML: two runs a closed block leaves
      // adjacent come back from the parser as ONE node, so the server's tree can legitimately
      // hold fewer nodes than `c()` builds. What may not differ is what they SAY, and a run
      // dropped by one branch only would change exactly that.
      expect(created).toBe(withoutIds(painted));
      // And nothing was added on the way in: adoption moves references, not nodes.
      expect(hydrated).toBe(painted);
    });
  }
});

describe('§6.14 — and the count really went down (the BUG is the nodes, not the bytes)', () => {
  it('app-badge keeps only what renders: the span, the slot and the two runs inside it', () => {
    // Four of its six nodes were the author's indentation. The two the `<span>` holds are
    // conserved, and correctly: inside an inline box that whitespace is between the content
    // and its edges, and nothing here can prove where the line starts.
    const { paintedNodes } = three('app-badge', { tone: 'success' }, ['success']);
    expect(paintedNodes).toBe(4);
  });

  it('app-button keeps only the button and its slot', () => {
    // A `<button>` is inline-block: a block container inside, whose edges trim. All four go.
    const { paintedNodes } = three('app-button', {}, [undefined, undefined]);
    expect(paintedNodes).toBe(2);
  });
});
