import { state, type Entry } from './container.js';
import type { Container, Provider, ProvideOptions } from './types.js';

/**
 * The root registry, and the only module state in the package. It is paid for by whoever
 * imports `provide`, `Service` or `injectFrom` — which is everyone who uses DI, and
 * nobody else.
 *
 * A service module has exactly one effect when it loads: enrolling itself here. That is
 * deterministic, idempotent and bounded to its own class, so a service module is a legal
 * import from the neutral zone of a `@code`.
 */
const root = new Map<unknown, Entry>();

/**
 * Standard (stage-3) class decorator. Registers the class in the ROOT registry with
 * `() => new C()` as its factory. Returns the class untouched.
 *
 * **`context` is optional, and that is a fact about the toolchain rather than a taste.** A
 * stage-3 class decorator IS `(target, context) => target`, so `@Service` and `Service(C)`
 * are the same call — but neither the transform that runs the test suite nor the one the
 * bundler uses lowers standard decorators today: they pass `@Service class C {}` through and
 * the runtime chokes on it. Until they do, `Service(C)` written under the class is the form
 * that works, and it must not be made to invent a context object to be allowed to.
 */
export function Service<T extends abstract new (...args: never[]) => unknown>(
  target: T,
  context?: ClassDecoratorContext,
): T {
  void context;
  const ctor = target as unknown as new () => unknown;
  root.set(target, { factory: () => new ctor(), transient: false });
  return target;
}

/** Register in the ROOT registry. The non-decorator form of `@Service`: takes a factory. */
export function provide<T>(
  provider: Provider<T>,
  factory: () => T,
  options?: ProvideOptions,
): void {
  root.set(provider, { factory, transient: options?.transient === true });
}

/**
 * Register in ONE container. This is what a component's `provide(…)` compiles to: the
 * component becomes the owner of that token for its whole subtree, and a descendant that
 * injects it gets this instance rather than the global one.
 */
export function provideIn<T>(
  container: Container,
  provider: Provider<T>,
  factory: () => T,
  options?: ProvideOptions,
): void {
  state(container).registry.set(provider, {
    factory,
    transient: options?.transient === true,
  });
}

/** What the root registry holds for a provider, if anything. Internal to the package. */
export function registered(provider: unknown): Entry | undefined {
  return root.get(provider);
}
