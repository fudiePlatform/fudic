// The tags that come up without a gesture. A form-associated control that is not defined is
// not labelable, adds nothing to `FormData` and has no validity, so it cannot wait for a click.

import { type PageMaps } from './maps.js';
import { ID_ATTR, idOf, instancesOf, ROUTE_HOST, type InstanceState } from './instances.js';

export interface EagerConfig {
  readonly maps: PageMaps;
  readonly state: InstanceState;
  readonly doc: Document;
  readonly arrivals: { readonly finished: boolean };
  /** The same path a gesture takes. */
  readonly raise: (host: Element, id: number, replay: () => void) => Promise<void>;
}

// No gesture, so nothing to replay.
const NOTHING = (): void => {};

// One step up, through a shadow root to its host. Duck-typed so document doubles work.
function up(node: Node): Node | null {
  return node.parentNode ?? (node as Partial<ShadowRoot>).host ?? null;
}

// The outermost hydratable ancestor. The node a control edits is handed down by its owners,
// so the whole chain has to come up, and only its root can raise it in one walk.
function outermostOwner(instance: Element): Element {
  let out = instance;
  for (let node = up(instance); node !== null; node = up(node)) {
    const el = node as Element;
    if (typeof el.hasAttribute === 'function' && el.hasAttribute(ID_ATTR)) out = el;
  }
  return out;
}

/** Brings up every eager tag the page has so far. Safe to call again as parts arrive. */
export function createEagerRaiser(config: EagerConfig): () => void {
  const { maps, state, doc, arrivals, raise } = config;

  return (): void => {
    const hosts = new Map<number, Element>();
    for (const tag of maps.eager) {
      // A route is listed by its name and has no instances to look up: its host is the body.
      if (tag === maps.route) {
        for (const body of instancesOf(ROUTE_HOST, doc)) hosts.set(idOf(body), body);
        continue;
      }
      for (const instance of instancesOf(tag, doc)) {
        const owner = outermostOwner(instance);
        hosts.set(idOf(owner), owner);
        // The instance too: a route only walks the components it hands values to, so one
        // inside a route that receives nothing is reached by nobody else.
        hosts.set(idOf(instance), instance);
      }
    }
    if (hosts.size === 0) return;
    void (async (): Promise<void> => {
      for (const [id, host] of hosts) {
        if (state.hydrated.has(id)) continue;
        // The route waits for the last part; this pass runs again then.
        if (!arrivals.finished && host.localName === ROUTE_HOST) continue;
        // Marked before the await, so a gesture on it meanwhile does not raise it again.
        state.hydrated.add(id);
        await raise(host, id, NOTHING);
      }
    })();
  };
}
