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
import { graphRegistry } from '@fudic/compiler';
import { cached } from './cache.js';
import { FILE_EXPORT } from './constants.js';
import { hostAttribute, pageShell, showPage } from './document.js';
import { graphOf } from './graph.js';
import { hostPage } from './host.js';
import { chunkMap, hydrate, resolverOf } from './hydrate.js';
import { renderPage } from './page.js';
import { localized } from './project.js';
import { settled, track } from './pending.js';
import { standTree, type ProviderOverride } from './providers.js';
import { serverRoot } from './api.js';
import { enterWorld, harnessOf, type Harness, type WorldOptions } from './session.js';

/** What `import * as X from './x.fud'` gives in the `fudic` environment. */
export interface FudModule {
  readonly tag: string;
  readonly css: string;
  readonly render: (...args: never[]) => unknown;
  /** The file it was compiled from (§4.2). Only in the `fudic` environment. */
  readonly [FILE_EXPORT]: string;
}

/** The part of a module `mount` reads: its tag and its file. */
export type MountTarget = Pick<FudModule, 'tag' | typeof FILE_EXPORT>;

export interface MountOptions<P> extends WorldOptions {
  readonly props?: P;
  /** `'ssr'` (by default): the server's HTML, DSD and hydration. `'client'`: `createElement`. */
  readonly via?: 'ssr' | 'client';
  /** The URL of the page it lives in. `/` by default. */
  readonly url?: string;
}

export interface Mounted<P> extends Harness {
  /** The component's element. */
  readonly host: HTMLElement;
  /** Its shadow root. */
  readonly root: ShadowRoot;
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
 * A `Date` as `fud-state` carries it, at any depth: its milliseconds (SDD-61 §4.4). `this[key]`
 * and not `field`, which `Date.prototype.toJSON` has already turned into text.
 */
function marked(this: Record<string, unknown>, key: string, field: unknown): unknown {
  const raw = this[key];
  return raw instanceof Date ? { $d: raw.getTime() } : field;
}

/** The reverse, as `@fudic/core` reads the block: an object with `$d` and nothing else. */
function revived(_key: string, field: unknown): unknown {
  const keys = typeof field === 'object' && field !== null ? Object.keys(field) : [];
  return keys.length === 1 && keys[0] === '$d' ? new Date((field as { $d: number }).$d) : field;
}

/**
 * Fail unless `value` is JSON: what the server renders for a prop travels to the browser in
 * the hydration state, and a value that does not survive `JSON` arrives as something else.
 * A `Date` survives: the hydration state marks it.
 */
function assertJson(tag: string, name: string, value: unknown): void {
  const json = JSON.stringify(value, marked) as string | undefined;
  if (json === undefined || !isDeepStrictEqual(JSON.parse(json, revived), value)) {
    throw new Error(
      `mount(<${tag}>): prop "${name}" is not JSON, and via 'ssr' renders it on the server — mount it with via: 'client'`,
    );
  }
}

/**
 * The host page of `component` with `props` named on it, painted to HTML: one page per
 * component and set of prop names, compiled once, whatever values each test hands it — the page
 * takes them from its `data`. Its components are noted, so their server functions answer.
 */
async function paintHost(component: MountTarget, props: object, url: string): Promise<string> {
  const { tag } = component;
  const attrs = Object.keys(props).map((name) => ` .${name}=@(data[${JSON.stringify(name)}])`);
  const page = cached(
    'mount',
    'fud',
    hostPage({ links: [{ rel: 'component', href: component[FILE_EXPORT] }], body: `<${tag}${attrs.join('')}></${tag}>` }),
  );
  return renderPage(localized(page), { hasDi: true }, '/', url, props);
}

async function viaSsr(
  component: MountTarget,
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
  component: MountTarget,
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
  await track(import(/* @vite-ignore */ localized(`${component[FILE_EXPORT]}?client`)));
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
  component: MountTarget,
  options: MountOptions<P> = {},
): Promise<Mounted<P>> {
  const props: object = options.props ?? {};
  const url = options.url ?? '/';
  const providers = enterWorld(options, url);
  await serverRoot();
  const order = propOrder(component[FILE_EXPORT], component.tag);
  // Checked before anything is painted: a prop the component does not declare is the test's
  // mistake, whichever road it takes.
  positions(component.tag, order, props);
  const host =
    options.via === 'client'
      ? await viaClient(component, props, url, order, providers)
      : await viaSsr(component, props, url, providers);
  await settled();
  const root = host.shadowRoot!;
  // Onto the harness, not spread from it: `invalidated` is a getter, and a spread would freeze it.
  return Object.assign(harnessOf(root), {
    host,
    root,
    async props(next: Partial<P>) {
      const payload: unknown[] = [];
      for (const [at, value] of positions(component.tag, order, next)) payload[PAYLOAD_OFFSET + at] = value;
      host.u(payload);
      await settled();
    },
    unmount() {
      host.remove();
    },
  });
}

/**
 * The HTML the server answers for `component` with `props` — the whole host page — without a
 * DOM (§3.4): the contract a test reads with `toContainTemplate`. Its props are JSON, as they
 * are on the server road.
 */
export async function renderToHtml<P extends object = Record<string, unknown>>(
  component: MountTarget,
  options: { readonly props?: P; readonly url?: string } = {},
): Promise<string> {
  const props: object = options.props ?? {};
  positions(component.tag, propOrder(component[FILE_EXPORT], component.tag), props);
  for (const [name, value] of Object.entries(props)) assertJson(component.tag, name, value);
  return paintHost(component, props, options.url ?? '/');
}
