/**
 * The services a test puts in place of the real ones (§3.2, decision 8.1.11).
 *
 * Each one is registered in the ROOT container of the page's tree, the same tree the
 * runtime builds in a browser: a component resolves from its own container upwards, so what
 * the root holds wins over a `@Service` or a global `provide`. What an owning component
 * provides inside its own subtree still wins there, because that is how resolution works.
 */

import { provideIn, type Container, type Provider } from '@fudic/di';
import { buildTree, installPage, type IocMap } from '@fudic/di/page';

/** One service of the test: what is asked for, and what answers it. */
export interface ProviderOverride<T = unknown> {
  readonly provide: Provider<T>;
  readonly use: () => T;
}

/** Register every override in `root`. */
function override(root: Container, providers: readonly ProviderOverride[]): void {
  for (const { provide, use } of providers) provideIn(root, provide, use);
}

/** The overrides of the test that is running, for the server's side of it. */
let current: readonly ProviderOverride[] = [];

/** The overrides the server's containers get from now on, until the test ends. */
export function serveOverrides(providers: readonly ProviderOverride[]): void {
  current = providers;
}

/**
 * `container` with the running test's overrides in it: what a request of the in-memory server
 * resolves from, and what a page the harness paints renders with (§4.6).
 */
export function overridden<C extends Container>(container: C): C {
  override(container, current);
  return container;
}

/** The JSON a page published under `id`, or `undefined` when it published none. */
function block<T>(id: string): T | undefined {
  const el = document.getElementById(id);
  return el === null ? undefined : (JSON.parse(el.textContent) as T);
}

/**
 * The page's container tree, as the runtime's coordinator stands it up: from the `fud-ioc`
 * map and the `fud-di` seed the page printed, or a lone root when it printed none. Fresh on
 * every call, so no test sees the containers of the one before. The overrides go in its root.
 */
export async function standTree(
  resolveChunk: (tag: string) => string,
  providers: readonly ProviderOverride[],
): Promise<void> {
  const map = block<IocMap>('fud-ioc');
  const seed = block<Readonly<Record<string, unknown>>>('fud-di');
  const tree =
    map === undefined
      ? buildTree([-1], () => {}, seed)
      : await installPage({ map, resolveChunk, ...(seed === undefined ? {} : { seed }) });
  override(tree[0]!, providers);
}
