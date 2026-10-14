/**
 * `mount`: one component, in happy-dom, by either of the two roads a shadow root is born on
 * (§3.2, §4.2, §4.3).
 *
 * - `'ssr'`: a host page instantiates it, the page is painted to HTML as `vite dev` paints a
 *   route, the HTML becomes the document with its declarative shadow roots applied, and
 *   hydration is installed. Its props travel as literals of that page, so they have to be JSON.
 * - `'client'`: its `?client` chunk defines the tag, and the harness creates it as a parent
 *   creates a child at runtime — `createElement`, then the props in the order the component
 *   declares them.
 */

import { isDeepStrictEqual } from 'node:util';
import { graphRegistry, resolveDocument, type ComponentGraph } from '@fudic/compiler';
import { nodeIo } from '@fudic/vite/harness';
import { cached } from './cache.js';
import { BASE_URL, FILE_EXPORT } from './constants.js';
import { hostAttribute, pageShell, showPage } from './document.js';
import { hostPage } from './host.js';
import { chunkMap, hydrate, resolverOf } from './hydrate.js';
import { renderPage } from './page.js';
import { settled, track } from './pending.js';
import { serveOverrides, standTree, type ProviderOverride } from './providers.js';
import { answerWith, type FetchOverride } from './fetch.js';
import { knowComponents } from './server.js';
import { controlWith, invalidated } from './sw.js';
import { gesturesOf, type Gestures } from './gestures.js';
import { queriesOf, type Queries } from './queries.js';

/** What `import * as X from './x.fud'` gives in the `fudic` environment. */
export interface FudModule {
  readonly tag: string;
  readonly css: string;
  readonly render: (...args: never[]) => unknown;
  /** The file it was compiled from (§4.2). Only in the `fudic` environment. */
  readonly [FILE_EXPORT]: string;
}

export interface MountOptions<P> {
  readonly props?: P;
  /** `'ssr'` (by default): the server's HTML, DSD and hydration. `'client'`: `createElement`. */
  readonly via?: 'ssr' | 'client';
  /** The URL of the page it lives in. `/` by default. */
  readonly url?: string;
  /** Services that take the place of the tree's (decision 8.1.11). */
  readonly providers?: readonly ProviderOverride[];
  /** Answers this test's requests in place of the in-memory server (§3.5). */
  readonly fetch?: FetchOverride;
  /** A simulated Service Worker controls the page (§3.6). */
  readonly sw?: boolean;
}

export interface Mounted<P> extends Queries, Gestures {
  /** The component's element. */
  readonly host: HTMLElement;
  /** Its shadow root. */
  readonly root: ShadowRoot;
  /** The paths the simulated worker was told to invalidate (§3.6). Empty without `sw`. */
  readonly invalidated: readonly string[];
  /** Change props as a parent would, and wait for the repaint. */
  props(next: Partial<P>): Promise<void>;
  unmount(): void;
}

/** What a parent calls on the element of a component (SDD-17, entry points 2 and 3). */
interface ComponentElement extends HTMLElement {
  c(props: readonly unknown[]): void;
  u(props: readonly unknown[]): void;
}

/** The slots before the props in the payload `u` takes: the DOM adapter and the shadow root. */
const PAYLOAD_OFFSET = 2;

/**
 * The graph of each `.fud` asked about, resolved once per test file: a test that mounts the
 * same component ten times reads and resolves its sources once.
 */
const graphs = new Map<string, ComponentGraph>();

/** The graph of a `.fud`: the components it reaches, itself included. */
function graphOf(file: string): ComponentGraph {
  let graph = graphs.get(file);
  if (graph === undefined) {
    graph = resolveDocument(file, nodeIo()).value;
    graphs.set(file, graph);
  }
  return graph;
}

/** The names of the props `tag` declares, in the order its payload carries them. */
function propOrder(file: string, tag: string): readonly string[] {
  // `file` is `tag`'s own module, so its registry always knows it.
  return graphRegistry(graphOf(file)).propsOf!(tag)!.map((prop) => prop.name);
}

/** The position of each prop of `props`, or an error naming the one `tag` does not declare. */
function positions(tag: string, order: readonly string[], props: object): [number, unknown][] {
  return Object.entries(props).map(([name, value]) => {
    const at = order.indexOf(name);
    if (at === -1) throw new Error(`<${tag}> declares no prop "${name}"`);
    return [at, value];
  });
}

/**
 * Fail unless `value` is JSON: what the server renders for a prop travels to the browser in
 * the hydration state, and a value that does not survive `JSON` arrives as something else.
 */
function assertJson(tag: string, name: string, value: unknown): void {
  const json = JSON.stringify(value) as string | undefined;
  if (json === undefined || !isDeepStrictEqual(JSON.parse(json), value)) {
    throw new Error(
      `mount(<${tag}>): prop "${name}" is not JSON, and via 'ssr' renders it on the server — mount it with via: 'client'`,
    );
  }
}

/** Point the environment's location at `url`. */
function visitUrl(url: string): void {
  (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL(new URL(url, BASE_URL).href);
}

/**
 * The host page of `component` with `props` named on it, painted to HTML: one page per
 * component and set of prop names, compiled once, whatever values each test hands it — the page
 * takes them from its `data`. Its components are noted, so their server functions answer.
 */
async function paintHost(component: FudModule, props: object, url: string): Promise<string> {
  const { tag } = component;
  const attrs = Object.keys(props).map((name) => ` .${name}=@(data[${JSON.stringify(name)}])`);
  const page = cached(
    'mount',
    'fud',
    hostPage({ links: [{ rel: 'component', href: component[FILE_EXPORT] }], body: `<${tag}${attrs.join('')}></${tag}>` }),
  );
  knowComponents(graphOf(page).components.values());
  return renderPage(page, { hasLoad: false, hasDi: true }, '/', url, props);
}

async function viaSsr(
  component: FudModule,
  props: object,
  url: string,
  providers: readonly ProviderOverride[],
): Promise<ComponentElement> {
  const { tag } = component;
  for (const [name, value] of Object.entries(props)) assertJson(tag, name, value);
  const body = showPage(await paintHost(component, props, url));
  const page = graphOf(component[FILE_EXPORT]).components.values();
  hydrate(body, chunkMap([{ tag, path: component[FILE_EXPORT] }, ...page]), providers);
  return body.querySelector<ComponentElement>(tag)!;
}

async function viaClient(
  component: FudModule,
  props: object,
  url: string,
  order: readonly string[],
  providers: readonly ProviderOverride[],
): Promise<ComponentElement> {
  const { tag } = component;
  // The page around it, without its props: its `<head>` carries the stylesheets the component
  // adopts by specifier, and the host the server painted says which ones (`data-fud-adopt`).
  const html = await paintHost(component, {}, url);
  const body = pageShell(html);
  // Every component has a `?client` chunk, and importing it defines the tag.
  await track(import(/* @vite-ignore */ `${component[FILE_EXPORT]}?client`));
  // No page printed a tree: the component resolves from a lone root, with the overrides in it.
  await standTree(resolverOf(new Map()), providers);
  const payload: unknown[] = Array.from({ length: order.length });
  for (const [at, value] of positions(tag, order, props)) payload[at] = value;
  // As a parent creates a child (SDD-17, entry point 2): the element, the sheets it adopts, and
  // its props in the order it declares them.
  const host = document.createElement(tag) as ComponentElement;
  const adopt = hostAttribute(html, tag, 'data-fud-adopt');
  if (adopt !== null) host.setAttribute('data-fud-adopt', adopt);
  host.c(payload);
  body.append(host);
  return host;
}

/** Mount `component` and hand back what a test reads and drives. */
export async function mount<P extends object = Record<string, unknown>>(
  component: FudModule,
  options: MountOptions<P> = {},
): Promise<Mounted<P>> {
  const props: object = options.props ?? {};
  const providers = options.providers ?? [];
  serveOverrides(providers);
  answerWith(options.fetch);
  controlWith(options.sw === true);
  const order = propOrder(component[FILE_EXPORT], component.tag);
  // Checked before anything is painted: a prop the component does not declare is the test's
  // mistake, whichever road it takes.
  positions(component.tag, order, props);
  const url = options.url ?? '/';
  visitUrl(url);
  const host =
    options.via === 'client'
      ? await viaClient(component, props, url, order, providers)
      : await viaSsr(component, props, url, providers);
  await settled();
  const root = host.shadowRoot!;
  return {
    ...queriesOf(root),
    ...gesturesOf(root),
    host,
    get invalidated() {
      return invalidated();
    },
    root,
    async props(next) {
      const payload: unknown[] = [];
      for (const [at, value] of positions(component.tag, order, next)) payload[PAYLOAD_OFFSET + at] = value;
      host.u(payload);
      await settled();
    },
    unmount() {
      host.remove();
    },
  };
}

/**
 * The HTML the server answers for `component` with `props` — the whole host page — without a
 * DOM (§3.4): the contract a test reads with `toContainTemplate`. Its props are JSON, as they
 * are on the server road.
 */
export async function renderToHtml<P extends object = Record<string, unknown>>(
  component: FudModule,
  options: { readonly props?: P; readonly url?: string } = {},
): Promise<string> {
  const props: object = options.props ?? {};
  positions(component.tag, propOrder(component[FILE_EXPORT], component.tag), props);
  for (const [name, value] of Object.entries(props)) assertJson(component.tag, name, value);
  return paintHost(component, props, options.url ?? '/');
}
