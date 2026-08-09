// @vitest-environment happy-dom
/**
 * BUG-18 §6.7–§6.10 — the update channel is sparse, run against a real DOM.
 *
 * The emitted text is checked in `client.test.ts`; what cannot be checked there is the
 * SEMANTICS the two shapes disagree about. A destructuring pattern assigns everything it
 * names, so a hole and a present `undefined` are the same thing to it (`[, , a] = [1,2]`
 * and `[, , a] = [1,2,undefined]` both leave `a` at `undefined`) — which is exactly why
 * BUG-12 §3.4 sent the whole tuple. With `if (2 in $p)` the two are finally different, and
 * "different" is a claim about what the DOM holds afterwards, not about the source.
 *
 * Both components are compiled, rendered by SSR, mounted as the parser would leave them,
 * and hydrated child-first as SDD-17 §5 prescribes — so the `u` under test is reached the
 * way a page reaches it, through the parent's own subscription.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { FudicElement, signal, subscribe } from '@fudic/core';
import {
  resolveComponents,
  emitComponentClientModule,
  type ComponentGraph,
} from '../../../src/emit/index.js';
import { memoryIo } from '../_support.js';
import { mountAsDsd, serverShadowHtml } from './_harness.js';

/**
 * Two props, one node each — the canonical child of props-spec §4.2. Two nodes and not one
 * because the whole question is whether the OTHER one is touched, and a single node cannot
 * answer it.
 */
const DISPLAY =
  '@code {\n' +
  "  const { label = 'sin título', value = 0 } = props<{ label?: string; value?: number }>();\n" +
  '}\n' +
  '\n' +
  '<x-display>\n' +
  '  <template shadowrootmode="open">' +
  '<b class="l">@label</b><span class="v">@value</span>' +
  '</template>\n' +
  '</x-display>\n';

/** One reactive prop and one constant: `label` cannot move, and decision 75 says so. */
const PANEL =
  '<link rel="component" href="./x-display.fud">\n' +
  '\n' +
  '@code {\n' +
  '  @client {\n' +
  "    import { signal } from '@fudic/core';\n" +
  '\n' +
  '    const count = signal(5);\n' +
  '\n' +
  "    document.addEventListener('bump', () => count.set(count() + 1));\n" +
  '  }\n' +
  '}\n' +
  '\n' +
  '<x-panel>\n' +
  '  <template shadowrootmode="open">' +
  '<x-display .label="Total" .value="@count"></x-display>' +
  '</template>\n' +
  '</x-panel>\n';

const graph: ComponentGraph = resolveComponents(
  '/page.fud',
  memoryIo({
    '/page.fud':
      '<link rel="component" href="./x-panel.fud">\n' +
      '<html><head></head><body><x-panel></x-panel></body></html>\n',
    '/x-panel.fud': PANEL,
    '/x-display.fud': DISPLAY,
  }),
);

beforeAll(() => {
  for (const tag of ['x-display', 'x-panel']) {
    const body = emitComponentClientModule(graph, graph.components.get(tag)!).replace(
      /^import .*$/gmu,
      '',
    );
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function('FudicElement', 'signal', '$sub', body)(FudicElement, signal, subscribe);
  }
});

interface Mounted {
  readonly host: FudicElement;
  readonly child: FudicElement;
  readonly label: () => string;
  readonly value: () => string;
  readonly labelNode: () => Element;
}

/** The page just after parsing, hydrated deepest-first: the cascade of SDD-17 §5. */
function mounted(): Mounted {
  const { host, shadow } = mountAsDsd('x-panel', serverShadowHtml(graph, 'x-panel', {}));
  const child = shadow.querySelector('x-display') as FudicElement;
  const q = (sel: string): Element => child.shadowRoot!.querySelector(sel)!;
  child.h(['Total', 5]);
  (host as FudicElement).h([]);
  return {
    host: host as FudicElement,
    child,
    label: () => q('.l').textContent!,
    value: () => q('.v').textContent!,
    labelNode: () => q('.l'),
  };
}

describe('BUG-18 — a sparse update, over a real DOM', () => {
  it('§6.7 — moving the signal writes the value node and leaves the other one alone', async () => {
    const { host, labelNode, value } = mounted();
    // Marked BY HAND before firing, and the mutations recorded independently: `$w` is
    // precisely what hides the symptom today, so using it as the witness would prove the
    // opposite of the criterion. What is asserted is the DOM's own account of what moved.
    labelNode().textContent = 'MARCA';
    const seen: Node[] = [];
    const obs = new MutationObserver((records) => {
      for (const r of records) seen.push(r.target);
    });
    obs.observe(host.shadowRoot!, { subtree: true, characterData: true, childList: true });

    document.dispatchEvent(new Event('bump'));
    await Promise.resolve(); // MutationObserver delivers on a microtask

    expect(value()).toBe('6');
    expect(labelNode().textContent).toBe('MARCA'); // nobody wrote over the mark
    expect(seen.every((n) => !labelNode().contains(n))).toBe(true);
    obs.disconnect();
    host.remove();
  });

  it('§6.8 — an absent hole leaves the prop as it stands, it does not restore the default', () => {
    const { host, child, label, value } = mounted();
    expect(label()).toBe('Total');

    const p: unknown[] = [];
    p[3] = 9; // only `value` — index 2 is a HOLE, not a present `undefined`
    child.u(p);

    expect(value()).toBe('9');
    // The exact failure BUG-12 §3.4 reasoned out for not making the channel partial: with
    // a destructuring pattern `label` would be back at 'sin título' here.
    expect(label()).toBe('Total');
    host.remove();
  });

  it('§6.9 — a PRESENT undefined does apply the default', () => {
    const { host, child, label, value } = mounted();
    expect(value()).toBe('5');

    child.u([undefined, undefined, undefined]); // index 2 present, holding `undefined`

    expect(label()).toBe('sin título');
    expect(value()).toBe('5'); // index 3 was never in the array: untouched
    host.remove();
  });

  it('§6.10 — two props moved in one call, one $a() and no intermediate state', () => {
    const { host, child, label, value } = mounted();

    child.u([undefined, undefined, 'Neto', 12]);

    expect(label()).toBe('Neto');
    expect(value()).toBe('12');
    // "One `$a()`" is a fact about the emitted body, and it is where the absence of an
    // observable intermediate state comes from: the guards reassign, and only then does a
    // single pass reach the DOM. A second `$a()` per prop could not be seen from here —
    // `$w` would swallow the repeat — so it is asserted where it is decidable.
    const chunk = emitComponentClientModule(graph, graph.components.get('x-display')!);
    const update = chunk.slice(chunk.indexOf('u: ($p) =>'), chunk.indexOf('r: () =>'));
    expect(update.match(/\$a\(\);/gu)).toHaveLength(1);
    expect(update.indexOf('$a();')).toBeGreaterThan(update.lastIndexOf('in $p'));
    host.remove();
  });
});
