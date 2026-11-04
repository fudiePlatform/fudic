// @vitest-environment happy-dom
/**
 * SDD-64 criteria 11–13: `sourceLocations` stamps every element a template writes with
 * `data-fud-src="<file>:<line>:<col>"`, the place of its opening tag. The server puts it in the
 * HTML, the client that fabricates the same component writes the same attributes, and without the
 * option nothing changes.
 */

import { describe, expect, it } from 'vitest';
import { SsrDom } from '@fudic/ssr';
import { browserDom } from '@fudic/dom';
import { renderToString } from '@fudic/ssr';
import {
  emitComponentClientModule,
  emitComponentModule,
  entryComponent,
  resolveComponents,
  type ComponentGraph,
  type EmitOptions,
} from '../../../src/emit/index.js';
import { SOURCE_ATTRIBUTE } from '../../../src/emit/source-locations.js';
import { memoryIo } from '../_support.js';
import { controller } from './_harness.js';
import { FudicElement, signal, computed, effect, subscribe, written, live, owned, type FudicElementCtor } from '@fudic/core';
import { emit } from '@fudic/dom';

const FILE = 'src/components/app-list.fud';

/** Lines are 1-based below; columns count from 1 at the `<`. */
const LIST = [
  '<link rel="snippet" href="./helpers.fud">', // 1
  '', // 2
  '@code {', // 3
  '  const { items = [], open = false } = props<{ items?: string[]; open?: boolean }>();', // 4
  '}', // 5
  '', // 6
  '<app-list>', // 7
  '  <template shadowrootmode="open">', // 8
  '    <ul>', // 9
  '      @foreach (const item of items) {', // 10
  '        <li><b>@item</b></li>', // 11
  '      }', // 12
  '    </ul>', // 13
  '    @if (open) {', // 14
  '      <p class="open">open</p>', // 15
  '    } else {', // 16
  '      <p class="closed">closed</p>', // 17
  '    }', // 18
  '    @render tag("local")', // 19
  '    @render badge("imported")', // 20
  '  </template>', // 21
  '</app-list>', // 22
  '', // 23
  '@snippet tag(text: string) {', // 24
  '  <em>@text</em>', // 25
  '}', // 26
  '',
].join('\n');

/** The imported snippet: its element is on line 2 of `helpers.fud`. */
const HELPERS = ['@snippet badge(text: string) {', '  <mark>@text</mark>', '}', ''].join('\n');

/** The component compiled as the host compiles it: as the entry of its own graph. */
const graph: ComponentGraph = resolveComponents(
  '/p/src/components/app-list.fud',
  memoryIo({ '/p/src/components/app-list.fud': LIST, '/p/src/components/helpers.fud': HELPERS }),
);
const comp = entryComponent(graph)!;

/** The server's HTML of the shadow root, with `options`. */
function server(props: unknown, options: EmitOptions): string {
  const source = emitComponentModule(graph, comp, options).replace(/^import .*$/gmu, '').replace(/^export\s+/gmu, '');
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const render = new Function(`${source}\nreturn render;`)() as (dom: unknown, shadow: unknown, props: unknown) => void;
  const dom = new SsrDom();
  const host = dom.element('app-list');
  render(dom, dom.attachShadow(host), props);
  const html = renderToString(host);
  return html.slice(html.indexOf('>', html.indexOf('<template')) + 1, html.lastIndexOf('</template>'));
}

/** The tree the client fabricates, with `options`, as HTML. */
function client(values: readonly unknown[], options: EmitOptions): string {
  const source = emitComponentClientModule(graph, comp, options).replace(/^import .*$/gmu, '');
  let factory: FudicElementCtor | undefined;
  const registry = { define: (_: string, ctor: FudicElementCtor) => void (factory = ctor) };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function('FudicElement', 'signal', 'computed', 'effect', '$sub', '$written', '$live', '$owned', 'emit', 'customElements', source)(
    FudicElement, signal, computed, effect, subscribe, written, live, owned, emit, registry,
  );
  const host = document.createElement('app-list');
  const shadow = host.attachShadow({ mode: 'open' });
  document.body.append(host);
  controller(factory!, browserDom, shadow, values).c();
  return shadow.innerHTML;
}

/** Every stamp in an HTML, tag by tag, in document order. */
const stamps = (html: string) => [...html.matchAll(/<([a-z0-9-]+)[^>]*? data-fud-src="([^"]+)"/gu)].map((m) => [m[1], m[2]]);

/** The texts by absolute path, as the host reads them, and the root they are named from. */
const TEXTS: Record<string, string> = { '/p/src/components/app-list.fud': LIST, '/p/src/components/helpers.fud': HELPERS };

/** What the host writes: the file relative to `/p/`, and the 1-based line and column of the offset in its own text. */
const ON: EmitOptions = {
  sourceLocations: (file, offset) => {
    const before = TEXTS[file]!.slice(0, offset).split('\n');
    return `${file.slice('/p/'.length)}:${before.length}:${before.at(-1)!.length + 1}`;
  },
};

describe('criterion 11 — the server stamps every element, in the branches and every turn of a loop', () => {
  it('an open list of two: the ul, each li and its b, the open branch, and the snippets', () => {
    expect(stamps(server({ items: ['a', 'b'], open: true }, ON))).toEqual([
      ['ul', `${FILE}:9:5`],
      ['li', `${FILE}:11:9`],
      ['b', `${FILE}:11:13`],
      ['li', `${FILE}:11:9`],
      ['b', `${FILE}:11:13`],
      ['p', `${FILE}:15:7`],
      ['em', `${FILE}:25:3`],
      // An imported snippet's element was written in its own file.
      ['mark', 'src/components/helpers.fud:2:3'],
    ]);
  });

  it('the other branch has its own place', () => {
    expect(stamps(server({ items: [], open: false }, ON))).toContainEqual(['p', `${FILE}:17:7`]);
  });

  it('a text node carries nothing: only elements are stamped', () => {
    const html = server({ items: ['a'], open: true }, ON);
    expect(html.match(new RegExp(SOURCE_ATTRIBUTE, 'gu'))).toHaveLength(stamps(html).length);
  });
});

describe('a component that is not the entry of its graph', () => {
  it('is stamped from its own text, as written', () => {
    const PLAIN = '<x-plain>\n  <template shadowrootmode="open">\n    <p>plain</p>\n  </template>\n</x-plain>\n';
    const PAGE = '<link rel="component" href="./x-plain.fud">\n<!DOCTYPE html>\n<html>\n  <head></head>\n  <body><x-plain></x-plain></body>\n</html>\n';
    const files: Record<string, string> = { '/p/src/index.fud': PAGE, '/p/src/x-plain.fud': PLAIN };
    const page = resolveComponents('/p/src/index.fud', memoryIo(files));
    const seen: [string, number][] = [];
    const code = emitComponentModule(page, page.components.get('x-plain')!, {
      sourceLocations: (file, offset) => {
        seen.push([file, offset]);
        return 'here';
      },
    });
    expect(seen).toEqual([['/p/src/x-plain.fud', PLAIN.indexOf('<p>')]]);
    expect(code).toContain(`'${SOURCE_ATTRIBUTE}', "here"`);
  });
});

describe('criterion 12 — the client that fabricates it writes the same attributes', () => {
  it.each([
    [{ items: ['a', 'b'], open: true }, [['a', 'b'], true]],
    [{ items: [], open: false }, [[], false]],
  ] as const)('server HTML and client HTML match for %j', (props, values) => {
    const ids = (html: string) => html.replace(/ data-fud-id="\d+"/gu, '');
    expect(ids(client(values, ON))).toBe(ids(server(props, ON)));
    expect(stamps(client(values, ON)).length).toBeGreaterThan(0);
  });
});

describe('criterion 13 — without the option, not a byte changes', () => {
  it('the server and the client modules are the same as with no options at all, and stamp nothing', () => {
    expect(emitComponentModule(graph, comp, {})).toBe(emitComponentModule(graph, comp));
    expect(emitComponentClientModule(graph, comp, {})).toBe(emitComponentClientModule(graph, comp));
    expect(emitComponentModule(graph, comp)).not.toContain(SOURCE_ATTRIBUTE);
    expect(emitComponentClientModule(graph, comp)).not.toContain(SOURCE_ATTRIBUTE);
    expect(server({ items: ['a'], open: true }, {})).not.toContain(SOURCE_ATTRIBUTE);
  });
});
