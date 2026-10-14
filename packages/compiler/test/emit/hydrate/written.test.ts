// @vitest-environment happy-dom
/**
 * A signal written BEFORE the hydration hooks its subscriptions up notified nobody. An
 * `effect` of `@client` that reads `localStorage` runs as the factory does, and the page kept
 * saying what the server painted. The hookup now renews the pass once when one of the file's
 * own signals was written (`$written`), and only then: `h()` with nothing written still adopts
 * without writing a single text node.
 */

import { describe, expect, it } from 'vitest';
import { browserDom, type DomClient } from '@fudic/dom';
import { resolveComponents, type ComponentGraph } from '../../../src/emit/index.js';
import { memoryIo } from '../_support.js';
import { clientFactory, controller, mountAsDsd, serverShadowHtml } from './_harness.js';

function graph(tag: string, client: string): ComponentGraph {
  const source =
    `@code {\n  @client {\n    import { signal, effect } from '@fudic/core';\n    const s = signal('a');\n${client}\n  }\n}\n` +
    `<${tag}>\n  <template shadowrootmode="open"><p>@s()</p></template>\n</${tag}>\n`;
  return resolveComponents(
    '/page.fud',
    memoryIo({
      '/page.fud': `<link rel="component" href="./${tag}.fud">\n<html><head></head><body><${tag}></${tag}></body></html>\n`,
      [`/${tag}.fud`]: source,
    }),
  );
}

/** `browserDom` counting the text writes, which is what «paints nothing» means. */
function counting(): { dom: DomClient<Node>; writes: () => number } {
  let writes = 0;
  return {
    dom: {
      ...browserDom,
      setText: (node, value) => {
        writes++;
        browserDom.setText(node, value);
      },
    },
    writes: () => writes,
  };
}

/** Paint on the server, mount as the parser leaves it, and hydrate. */
function hydrate(tag: string, client: string): { shadow: ShadowRoot; painted: string; writes: number } {
  const g = graph(tag, client);
  const { shadow } = mountAsDsd(tag, serverShadowHtml(g, tag, {}));
  const painted = shadow.innerHTML;
  const { dom, writes } = counting();
  controller(clientFactory(g, tag), dom, shadow, []).h();
  return { shadow, painted, writes: writes() };
}

describe('a component whose signal was written before the hookup', () => {
  it('h() paints the written value over the server’s', () => {
    const { shadow, painted } = hydrate('x-written', "    effect(() => { s.set('b'); });");
    expect(painted).toBe('<p>a</p>');
    expect(shadow.innerHTML).toBe('<p>b</p>');
  });

  it('with nothing written, h() writes no text at all', () => {
    const { shadow, writes } = hydrate('x-untouched', '');
    expect(shadow.innerHTML).toBe('<p>a</p>');
    expect(writes).toBe(0);
  });
});
