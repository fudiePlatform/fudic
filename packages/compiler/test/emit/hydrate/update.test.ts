// @vitest-environment happy-dom
/**
 * BUG-12 §6.7 — the criterion that DEFINES the bug: a click on the parent's button changes
 * the text inside the child's shadow root.
 *
 * Everything else in this branch is checked on the emitted text. This one is not checkable
 * there, because the failure it guards against is a channel that does not exist: the parent
 * owns the signal, the child owns the node, and between them there was nothing. So both
 * components are compiled, rendered by SSR, mounted as the parser would leave them, and
 * hydrated in the post-order SDD-17 §5 prescribes — child first, host last.
 *
 * **Why the parent listens on `document` instead of writing `@click="@inc"`.** Event
 * bindings are not emitted yet — BUG-12 goes BEFORE them on purpose, because they are
 * written against the controller contract and the contract was the thing that was wrong.
 * A click on a button inside a shadow root is `composed`, so it reaches `document`, and
 * the `@client` body — copied verbatim into the factory closure — can subscribe to it
 * there. The chain the test exercises is therefore emitted code end to end, with no
 * scaffolding on the test side: real click → parent's signal → emitted subscription →
 * child's `u` → child's `$a()` → the text node.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { FudicElement, signal } from '@fudic/core';
import {
  resolveComponents,
  emitComponentClientModule,
  type ComponentGraph,
} from '../../../src/emit/index.js';
import { memoryIo } from '../_support.js';
import { mountAsDsd, serverShadowHtml } from './_harness.js';

const DISPLAY =
  '@code {\n' +
  '  const { value = 0 } = props<{ value?: number }>();\n' +
  '}\n' +
  '\n' +
  '<app-display>\n' +
  '  <template shadowrootmode="open"><span class="val">@value</span></template>\n' +
  '</app-display>\n';

const COUNTER =
  '<link rel="component" href="./app-display.fud">\n' +
  '\n' +
  '@code {\n' +
  '  @client {\n' +
  "    import { signal } from '@fudic/core';\n" +
  '\n' +
  // Not 0: the child's own default is 0, so a signal that started there would make the
  // initial pass invisible — and an invisible pass is one the test cannot claim happened.
  '    const count = signal(5);\n' +
  '\n' +
  "    document.addEventListener('click', () => count.set(count.peek() + 1));\n" +
  '  }\n' +
  '}\n' +
  '\n' +
  '<app-counter>\n' +
  '  <template shadowrootmode="open">' +
  '<button>+</button><app-display .value="@count"></app-display>' +
  '</template>\n' +
  '</app-counter>\n';

const graph: ComponentGraph = resolveComponents(
  '/page.fud',
  memoryIo({
    '/page.fud':
      '<link rel="component" href="./app-counter.fud">\n' +
      '<html><head></head><body><app-counter></app-counter></body></html>\n',
    '/app-counter.fud': COUNTER,
    '/app-display.fud': DISPLAY,
  }),
);

/**
 * Register the emitted chunks with the REAL `customElements`. The other hydrate suites
 * capture the class instead, because they drive the factory directly; here the parent
 * calls `u` on the CHILD ELEMENT, so the child has to be an upgraded custom element —
 * that is the whole point of the entry point living on `FudicElement`.
 */
beforeAll(() => {
  for (const tag of ['app-display', 'app-counter']) {
    const body = emitComponentClientModule(graph, graph.components.get(tag)!).replace(
      /^import .*$/gmu,
      '',
    );
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function('FudicElement', 'signal', body)(FudicElement, signal);
  }
});

/** The page as the browser has it just after parsing: SSR markup, shadow roots realised. */
function mounted(): { host: FudicElement; button: HTMLButtonElement; text: () => string } {
  const { host, shadow } = mountAsDsd('app-counter', serverShadowHtml(graph, 'app-counter', {}));
  const child = shadow.querySelector('app-display') as FudicElement;
  return {
    host: host as FudicElement,
    button: shadow.querySelector('button')!,
    text: () => child.shadowRoot!.querySelector('.val')!.textContent!,
  };
}

/** The cascade of SDD-17 §5: deepest descendant first, the triggering host last. */
function hydrate(host: FudicElement): void {
  (host.shadowRoot!.querySelector('app-display') as FudicElement).h([undefined]);
  host.h([]);
}

describe('BUG-12 §6.7 — the parent moves, the child follows', () => {
  it('a click on the parent rewrites the text inside the child shadow root', () => {
    const { host, button, text } = mounted();
    hydrate(host);

    button.click();

    expect(text()).toBe('6');
    host.remove();
  });

  it('keeps following: every click is another value across the boundary', () => {
    const { host, button, text } = mounted();
    hydrate(host);

    button.click();
    button.click();
    button.click();

    expect(text()).toBe('8');
    host.remove();
  });

  it('hands the child its initial value at hookup, before anything moves', () => {
    // `$s()` runs on both paths, so the value is there whether the child was hydrated or
    // fabricated. The server painted the child's own default — it never saw the parent's
    // signal — and the owner of the value writes the real one as the parent comes alive.
    const { host, text } = mounted();
    expect(text()).toBe('0');

    hydrate(host);

    expect(text()).toBe('5');
    host.remove();
  });

  it('stops when the parent is torn down: r() disposes the subscription (§6.9)', () => {
    const { host, button, text } = mounted();
    hydrate(host);
    button.click();
    expect(text()).toBe('6');

    host.remove(); // disconnectedCallback → r() → $d.forEach
    document.body.append(host); // connected again, and still torn down: there is no c-back

    button.click(); // the signal still moves — the channel to the child does not
    expect(text()).toBe('6');
    host.remove();
  });
});
