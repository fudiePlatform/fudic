import type { Container } from './types.js';

/** One registration: the factory, and whether it is ever allowed to be cached. */
export interface Entry {
  readonly factory: () => unknown;
  readonly transient: boolean;
}

/**
 * A container, in full. `Container` is the opaque face of this — nothing outside the
 * package reads these fields, and nothing outside the package can make one.
 *
 * Data, not an object with methods: `createChild`, `destroy` and `injectFrom` are
 * functions that take it as their first argument, so whoever never destroys a container
 * never downloads `destroy`.
 */
export interface ContainerState extends Container {
  readonly label: string;
  readonly parent: ContainerState | null;
  /** Registered here, by this container. Empty in everything but an owner. */
  readonly registry: Map<unknown, Entry>;
  /** Built here, because this container owns the registration that built it. */
  readonly instances: Map<unknown, unknown>;
  /**
   * Values published for this container's page, by token name. Only the root ever has any.
   *
   * The table belongs to the CONTAINER and to nothing wider, and that is the whole of it: a
   * root is one request on the server and one page in the browser, so two responses being
   * rendered at the same time have two tables and cannot reach each other's. It was module
   * state once, and then a server answering two visitors at once painted one of them with
   * the other's values.
   */
  readonly seed: Record<string, unknown>;
  alive: boolean;
}

/**
 * Every `Container` this package hands out was made here, so this narrowing is total.
 * It is the single place where the opaque face is opened, and there is no other.
 */
export function state(container: Container): ContainerState {
  return container as ContainerState;
}

/**
 * The route container. `seed` is what the server published, by token name.
 *
 * Copied and not held: what the browser hands over is the parsed `fud-di` block, and what a
 * test hands over is a literal. A container that kept the caller's object would write into it
 * the moment anything published, and the caller's object is not the container's to write.
 */
export function createRoot(seed?: Readonly<Record<string, unknown>>): Container {
  const node: ContainerState = {
    label: 'root',
    parent: null,
    registry: new Map(),
    instances: new Map(),
    seed: { ...seed },
    alive: true,
  };
  return node;
}

/** A child container. `label` is for messages only; it takes no part in resolution. */
export function createChild(parent: Container, label: string): Container {
  const node: ContainerState = {
    label,
    parent: state(parent),
    registry: new Map(),
    instances: new Map(),
    seed: {},
    alive: true,
  };
  return node;
}

/**
 * The root of a chain — the container the seed lives in, and the last link a resolution
 * walks. Every container has one and it is reached by `parent` alone, so a chain built by
 * `createChild` is the only thing consulted: never the DOM, never a registry of pages.
 */
export function rootOf(container: ContainerState): ContainerState {
  let node = container;
  while (node.parent !== null) node = node.parent;
  return node;
}

/** Release a container's instances. Idempotent. */
export function destroy(container: Container): void {
  const node = state(container);
  node.instances.clear();
  node.alive = false;
}
