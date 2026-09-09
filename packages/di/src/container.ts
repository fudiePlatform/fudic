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
  /** Values the server published, by token name. Only the root ever has any. */
  readonly seed: Readonly<Record<string, unknown>>;
  alive: boolean;
}

/**
 * Every `Container` this package hands out was made here, so this narrowing is total.
 * It is the single place where the opaque face is opened, and there is no other.
 */
export function state(container: Container): ContainerState {
  return container as ContainerState;
}

/** The route container. `seed` is what the server published, by token name. */
export function createRoot(seed?: Readonly<Record<string, unknown>>): Container {
  const node: ContainerState = {
    label: 'root',
    parent: null,
    registry: new Map(),
    instances: new Map(),
    seed: seed ?? {},
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

/** Release a container's instances. Idempotent. */
export function destroy(container: Container): void {
  const node = state(container);
  node.instances.clear();
  node.alive = false;
}
