import { describe, expect, it } from 'vitest';

import {
  createChild,
  createRoot,
  destroy,
  inject,
  injectFrom,
  provide,
  provideIn,
  Service,
  token,
} from '../src/index.js';

/**
 * The whole suite runs in node and never names a DOM global, which is the point: the
 * container tree of a route is emitted code and a published map, never something read
 * back from the element tree.
 *
 * `Service` is applied as a call and not as `@Service`, because the transform that runs
 * the suite passes standard decorators through untouched. It is the same function either
 * way — a stage-3 class decorator IS `(target, context) => target` — and the decorator
 * syntax is exercised where it has to work, in the build of `examples/`.
 */
const CLASS = { kind: 'class' } as ClassDecoratorContext;

class Logger {
  static count = 0;
  readonly id = `Logger#${++Logger.count}`;
}
Service(Logger, CLASS);

class Cart {
  static count = 0;
  readonly id = `Cart#${++Cart.count}`;
  readonly log = inject(Logger);
}
Service(Cart, CLASS);

/** Never registered anywhere: only a component ever declares it. */
class Panel {}

/** A root service that asks for something only a component ever declares. */
class Broken {
  readonly panel = inject(Panel);
}
Service(Broken, CLASS);

describe('the root registry', () => {
  it('gives the same instance from the root, from a child and from a grandchild', () => {
    const root = createRoot();
    const child = createChild(root, 'child');
    const grandchild = createChild(child, 'grandchild');

    const a = injectFrom(root, Logger);
    expect(injectFrom(child, Logger)).toBe(a);
    expect(injectFrom(grandchild, Logger)).toBe(a);
  });

  it('registers with `provide` the same way, factory and all', () => {
    const STAMP = token<string>('stamp');
    provide(STAMP, () => 'once');

    const root = createRoot();
    expect(injectFrom(root, STAMP)).toBe('once');
    expect(injectFrom(createChild(root, 'c'), STAMP)).toBe('once');
  });

  it('keeps the class untouched: the decorator returns what it was given', () => {
    class Plain {}
    expect(Service(Plain, CLASS)).toBe(Plain);
  });
});

describe('an owning container', () => {
  it('wins over the root, even when the same class is also a @Service', () => {
    const root = createRoot();
    const owner = createChild(root, 'app-a');
    const descendant = createChild(createChild(owner, 'mid'), 'leaf');

    provideIn(owner, Cart, () => new Cart());

    const local = injectFrom(descendant, Cart);
    expect(injectFrom(owner, Cart)).toBe(local);
    expect(injectFrom(root, Cart)).not.toBe(local);
  });

  it('gives different instances to siblings under different owners', () => {
    const root = createRoot();
    const a = createChild(root, 'a');
    const b = createChild(root, 'b');
    provideIn(a, Cart, () => new Cart());
    provideIn(b, Cart, () => new Cart());

    const underA = injectFrom(createChild(a, 'a-leaf'), Cart);
    const underB = injectFrom(createChild(b, 'b-leaf'), Cart);

    expect(underA).not.toBe(underB);
    expect(injectFrom(createChild(a, 'a-other'), Cart)).toBe(underA);
  });

  it('builds the factory in the OWNER, so nothing can depend on something shorter-lived', () => {
    const root = createRoot();
    const owner = createChild(root, 'owner');
    provideIn(owner, Panel, () => new Panel());

    expect(() => injectFrom(owner, Broken)).toThrowError(/no registration for Panel/);
  });
});

describe('transient', () => {
  it('builds a new instance per resolution and leaves nothing behind', () => {
    class Ticket {}
    const root = createRoot();
    const owner = createChild(root, 'owner');
    provideIn(owner, Ticket, () => new Ticket(), { transient: true });

    const leaf = createChild(owner, 'leaf');
    expect(injectFrom(leaf, Ticket)).not.toBe(injectFrom(leaf, Ticket));
    expect(injectFrom(owner, Ticket)).not.toBe(injectFrom(owner, Ticket));
  });

  it('is a root registration too', () => {
    class Slip {}
    provide(Slip, () => new Slip(), { transient: true });
    const root = createRoot();
    expect(injectFrom(root, Slip)).not.toBe(injectFrom(root, Slip));
  });
});

describe('cycles', () => {
  it('name the whole chain and leave the stack clean for the next resolution', () => {
    const A = token<unknown>('A');
    const B = token<unknown>('B');
    provide(A, () => inject(B));
    provide(B, () => inject(A));

    const root = createRoot();
    expect(() => injectFrom(root, A)).toThrowError('cycle: A -> B -> A');
    expect(injectFrom(root, Logger)).toBeInstanceOf(Logger);
  });
});

describe('a missing registration', () => {
  it('throws naming the provider, and returns undefined when optional', () => {
    const GONE = token<number>('gone');
    const root = createRoot();

    expect(() => injectFrom(root, GONE)).toThrowError('no registration for gone');
    expect(injectFrom(root, GONE, { optional: true })).toBeUndefined();
  });

  it('never consults the seed for a class: what crosses the wire are values', () => {
    class Absent {}
    const root = createRoot({ Absent: 'not this' });
    expect(() => injectFrom(root, Absent)).toThrowError('no registration for Absent');
  });
});

describe('destroy', () => {
  it('releases the instances, is idempotent, and closes the container for good', () => {
    const root = createRoot();
    const child = createChild(root, 'child');
    provideIn(child, Panel, () => new Panel());

    injectFrom(child, Panel);
    destroy(child);
    destroy(child);

    expect(() => injectFrom(child, Panel)).toThrowError('container "child" is destroyed');
  });
});

describe('the seed', () => {
  it('serves a value with no registration at all, from anywhere in the chain', () => {
    const LINES = token<readonly string[]>('lines');
    const root = createRoot({ lines: ['a', 'b', 'c'] });

    expect(injectFrom(root, LINES)).toEqual(['a', 'b', 'c']);
    expect(injectFrom(createChild(root, 'leaf'), LINES)).toEqual(['a', 'b', 'c']);
  });

  it('identifies a token by the object and never by the name', () => {
    expect(token('x')).not.toBe(token('x'));
    expect(token('x').name).toBe('x');
  });
});

describe('the ambient container', () => {
  it('exists inside a factory, so a service field can inject', () => {
    const root = createRoot();
    const cart = injectFrom(root, Cart);
    expect(cart.log).toBe(injectFrom(root, Logger));
  });

  it('does not exist anywhere else', () => {
    expect(() => inject(Logger)).toThrowError(
      'inject(Logger) outside a factory: there is no ambient container',
    );
  });

  it('is restored after a factory returns, not merely cleared', () => {
    const OUTER = token<unknown>('outer');
    const INNER = token<unknown>('inner');
    const seen: (string | undefined)[] = [];

    provide(INNER, () => 'inner-value');
    provide(OUTER, () => {
      inject(INNER);
      // Still inside OUTER's factory: the ambient container came back.
      seen.push(String(inject(INNER)));
      return 'outer-value';
    });

    expect(injectFrom(createRoot(), OUTER)).toBe('outer-value');
    expect(seen).toEqual(['inner-value']);
  });
});
