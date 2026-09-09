import { rootOf, state, type ContainerState, type Entry } from './container.js';
import { registered } from './registry.js';
import type { Container, InjectOptions, Provider } from './types.js';

/**
 * The ambient container, which exists inside a factory and nowhere else. `injectFrom`
 * enters the owning container around the call to the factory and leaves it in a
 * `finally`, and that is what makes `log = inject(Logger)` legal as a field of a service
 * class. Nothing the author writes in a `@code` ever uses it: the compiler rewrites those
 * calls to their container-taking form, so there is no way to lose the container between
 * two statements.
 */
let ambient: ContainerState | null = null;

/** The chain of providers currently being built, so a cycle can name the whole of it. */
const building: unknown[] = [];

/** Nothing found, told apart from a value that legitimately is `undefined`. */
const MISSING = Symbol('missing');

/**
 * Resolve from the AMBIENT container. Legal in exactly one place: a field initializer or
 * the constructor of a service, which run inside the factory `injectFrom` is executing.
 */
export function inject<T>(provider: Provider<T>): T;
export function inject<T>(provider: Provider<T>, options: InjectOptions): T | undefined;
export function inject<T>(provider: Provider<T>, options?: InjectOptions): T | undefined {
  if (ambient === null) {
    throw new Error(`inject(${nameOf(provider)}) outside a factory: there is no ambient container`);
  }
  return resolve(ambient, provider, options);
}

/** Resolve from ONE container. This is what a component's `inject(…)` compiles to. */
export function injectFrom<T>(container: Container, provider: Provider<T>): T;
export function injectFrom<T>(
  container: Container,
  provider: Provider<T>,
  options: InjectOptions,
): T | undefined;
export function injectFrom<T>(
  container: Container,
  provider: Provider<T>,
  options?: InjectOptions,
): T | undefined {
  const from = state(container);
  if (!from.alive) {
    throw new Error(`container "${from.label}" is destroyed`);
  }
  return resolve(from, provider, options);
}

/**
 * The owner is the first container of the chain that has a registration; the root, where
 * the `@Service` classes live, is the last link. A provider that nothing registers can
 * still resolve from the seed the server published — that is the one case where a value
 * arrives without a factory behind it.
 */
function resolve<T>(
  from: ContainerState,
  provider: Provider<T>,
  options: InjectOptions | undefined,
): T | undefined {
  for (let owner: ContainerState | null = from; owner !== null; owner = owner.parent) {
    const entry = owner.registry.get(provider);
    if (entry !== undefined) return build(from, owner, provider, entry) as T;
  }

  const global = registered(provider);
  if (global !== undefined) return build(from, rootOf(from), provider, global) as T;

  const seeded = fromSeed(rootOf(from), provider);
  if (seeded !== MISSING) return seeded as T;

  if (options?.optional === true) return undefined;
  throw new Error(`no registration for ${nameOf(provider)}`);
}

/**
 * The factory runs in the OWNING container, not in the one that asked. From that alone
 * comes the life invariant, with no check anywhere: nothing can depend on something that
 * lives less than it does, because the owner's chain simply does not reach the shorter
 * registration.
 *
 * A `transient` is the exception, and only because it has no life of its own: it is built
 * where it was asked for and left in no container at all.
 */
function build(
  from: ContainerState,
  owner: ContainerState,
  provider: unknown,
  entry: Entry,
): unknown {
  if (entry.transient) return construct(from, provider, entry);
  if (owner.instances.has(provider)) return owner.instances.get(provider);
  const value = construct(owner, provider, entry);
  owner.instances.set(provider, value);
  return value;
}

function construct(where: ContainerState, provider: unknown, entry: Entry): unknown {
  if (building.includes(provider)) {
    throw new Error(`cycle: ${[...building, provider].map(nameOf).join(' -> ')}`);
  }
  building.push(provider);
  const previous = ambient;
  ambient = where;
  try {
    return entry.factory();
  } finally {
    ambient = previous;
    building.pop();
  }
}

/**
 * What the server published, by token name. Only a token is looked up here: a class is
 * built, never sent, because what crosses the wire are values and never instances.
 */
function fromSeed(root: ContainerState, provider: unknown): unknown {
  if (typeof provider === 'function') return MISSING;
  const name = nameOf(provider);
  return Object.hasOwn(root.seed, name) ? root.seed[name] : MISSING;
}

/** A class and a token both carry a `name`, and the name is only ever for messages. */
function nameOf(provider: unknown): string {
  return (provider as { readonly name: string }).name;
}
