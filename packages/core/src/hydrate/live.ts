import { pageElements, tagDefiner, type ElementRegistry } from './registry.js';

interface FabricatedHost extends Element {
  c(props: readonly unknown[]): void;
}

// A WeakSet rather than a mark on the element: nothing here may show on a user's component.
const raised = new WeakSet<Element>();

/**
 * Brings to life a component its parent created in the browser, downloading its
 * definition if needed. Calling it again for the same element does nothing, unless the
 * definition failed: then the next call tries again.
 */
export function live(host: Element, props: readonly unknown[]): void {
  if (raised.has(host)) return;
  raised.add(host);
  const tag = host.localName;
  const registry = pageElements();
  if (registry.get(tag) !== undefined) {
    raise(host, props, registry);
    return;
  }
  const define = tagDefiner();
  const pending = define === null ? registry.whenDefined(tag) : define(tag);
  void pending.then(
    () => {
      raise(host, props, registry);
    },
    (error: unknown) => {
      raised.delete(host);
      throw error;
    },
  );
}

function raise(host: Element, props: readonly unknown[], registry: ElementRegistry): void {
  // A fabricated element is not connected yet, so the browser would not upgrade it on its own.
  registry.upgrade(host);
  (host as FabricatedHost).c(props);
}
