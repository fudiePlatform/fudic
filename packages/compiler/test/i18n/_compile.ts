/**
 * Helpers for the compile-per-locale suites (SDD-58 phase 4): a `LocaleCompile` from a plain
 * table, a graph read through `localizedIo`, and the server render and client factory of an
 * emitted module that may import the runtime pieces of `@fudic/i18n`.
 *
 * The emitted modules are evaluated, not imported — as in `emit/hydrate/_harness.ts` — and an
 * `import { … } from '@fudic/i18n'` is answered with the package itself.
 */

import * as i18nPackage from '@fudic/i18n';
import * as core from '@fudic/core';
import { compileMessage } from '@fudic/i18n';
import { SsrDom, renderToString } from '@fudic/ssr';
import {
  FudicElement,
  computed,
  effect,
  live,
  owned,
  signal,
  subscribe,
  written,
  type FudicElementCtor,
} from '@fudic/core';
import { emit } from '@fudic/dom';
import {
  componentOf,
  emitComponentClientModule,
  emitComponentModule,
  localizedIo,
  resolveComponents,
  type ComponentGraph,
  type LocaleCompile,
  type Message,
} from '../../src/index.js';
import { memoryIo } from '../emit/_support.js';

/** `source → translation` in ICU: a catalog in miniature. */
export type Table = Readonly<Record<string, string>>;

/** A `LocaleCompile` answering from `table`, and recording what it was asked. */
export function i18nOf(
  table: Table,
  locale = 'en',
  locales: readonly string[] = ['es', 'en'],
): LocaleCompile & { readonly asked: Message[] } {
  const asked: Message[] = [];
  return {
    locale,
    locales,
    asked,
    translate: (message) => {
      asked.push(message);
      const text = table[message.source];
      return text === undefined ? undefined : compileMessage(text, locale).value;
    },
  };
}

/** The graph of `entry` among `files`, every file read through `localizedIo`. */
export function graphOf(files: Record<string, string>, entry: string, i18n: LocaleCompile): ComponentGraph {
  return resolveComponents(entry, localizedIo(memoryIo(files), i18n));
}

const I18N_IMPORT = /^\s*import \{([^}]*)\} from ['"]@fudic\/(?:i18n|core)['"];?$/gmu;

/** The packages behind `$i18n`: the pipes and `format`/`locale` live in core since SDD-71. */
const PACKAGES = { ...core, ...i18nPackage };

/** What `clientFactory` already passes in by name: an import of it is not bound again. */
const PASSED: ReadonlySet<string> = new Set([
  'FudicElement',
  'signal',
  'computed',
  'effect',
  '$sub',
  '$written',
  '$live',
  '$owned',
]);

/**
 * The module's `@fudic/i18n` and `@fudic/core` imports as bindings of the packages, and nothing
 * else imported.
 */
function bindI18n(source: string): string {
  return source
    .replace(I18N_IMPORT, (_all, names: string) => {
      const bound = names
        .split(',')
        .map((n) => n.trim())
        .filter((n) => n !== '' && !PASSED.has(n.split(/\s+as\s+/u).pop()!));
      return bound.length === 0 ? '' : `const {${bound.join(',').replace(/\bas\b/gu, ':')}} = $i18n;`;
    })
    .replace(/^import .*$/gmu, '')
    .replace(/^export\s+/gmu, '');
}

/** The server render of `tag`, evaluated with the package behind its i18n imports. */
export function serverRender(graph: ComponentGraph, tag: string): (dom: unknown, shadow: unknown, props: unknown) => void {
  const source = emitComponentModule(graph, componentOf(graph, tag)!);
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function('$i18n', `${bindI18n(source)}\nreturn render;`)(PACKAGES) as (
    dom: unknown,
    shadow: unknown,
    props: unknown,
  ) => void;
}

/** The inside of the shadow root the server paints for `tag`. */
export function serverHtml(graph: ComponentGraph, tag: string, props: unknown = {}): string {
  const dom = new SsrDom();
  const host = dom.element(tag);
  const shadow = dom.attachShadow(host);
  serverRender(graph, tag)(dom, shadow, props);
  const html = renderToString(host);
  const open = html.indexOf('>', html.indexOf('<template')) + 1;
  return html.slice(open, html.lastIndexOf('</template>'));
}

/** The emitted client factory of `tag`, its i18n imports bound to the package. */
export function clientFactory(graph: ComponentGraph, tag: string): FudicElementCtor {
  const source = emitComponentClientModule(graph, componentOf(graph, tag)!);
  let captured: FudicElementCtor | undefined;
  const registry = {
    define: (_name: string, ctor: FudicElementCtor): void => {
      captured = ctor;
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function(
    '$i18n',
    'FudicElement',
    'signal',
    'computed',
    'effect',
    '$sub',
    '$written',
    '$live',
    '$owned',
    'emit',
    'customElements',
    bindI18n(source),
  )(PACKAGES, FudicElement, signal, computed, effect, subscribe, written, live, owned, emit, registry);
  return captured!;
}
