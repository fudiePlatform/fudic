/**
 * SDD-72 §3.3 — the types of the bus: what `emit(name, detail)` must send is what every
 * receiver of `name` registers, intersected.
 *
 * The registry is written here by hand, the way a library's receiver would be (the projection of
 * a `.fud` writes the same shape). The names are this file's own so no other test sees them.
 * These assertions are checked by `tsc` (`pnpm typecheck`); the runtime part is one call that
 * shows the implementation did not change.
 */

import { describe, expect, expectTypeOf, it } from 'vitest';
import { emit, type BusArgs, type BusDetail, type BusParam } from '../src/emit.js';

interface Person {
  readonly id: number;
  readonly name: string;
}

declare global {
  interface FudicBusReceivers {
    'test/emit-types#alta-0': readonly ['sdd72-alta', Person];
    'test/emit-types#alta-1': readonly ['sdd72-alta', { name: string }];
    'test/emit-types#never-0': readonly ['sdd72-never', Person];
    'test/emit-types#never-1': readonly ['sdd72-never', number];
    'test/emit-types#ping-0': readonly ['sdd72-ping', unknown];
    'test/emit-types#opt-0': readonly ['sdd72-opt', number | undefined];
  }
}

describe('BusParam — what a handler takes', () => {
  it('its first parameter, or unknown if it takes none or is not a function', () => {
    expectTypeOf<BusParam<(p: Person) => void>>().toEqualTypeOf<Person>();
    expectTypeOf<BusParam<(p: Person, n: number) => void>>().toEqualTypeOf<Person>();
    expectTypeOf<BusParam<() => void>>().toEqualTypeOf<unknown>();
    expectTypeOf<BusParam<number>>().toEqualTypeOf<unknown>();
  });
});

describe('BusDetail — the intersection of the receivers', () => {
  it('two receivers sum up', () => {
    expectTypeOf<BusDetail<'sdd72-alta'>>().toEqualTypeOf<Person & { name: string }>();
  });

  it('a name nobody registers is unknown', () => {
    expectTypeOf<BusDetail<'sdd72-nobody'>>().toEqualTypeOf<unknown>();
  });

  it('a name that is not a literal has no types, as before (§7): unknown, not every receiver at once', () => {
    expectTypeOf<BusDetail<string>>().toEqualTypeOf<unknown>();
    expectTypeOf<BusArgs<string>>().toEqualTypeOf<[detail?: unknown]>();
  });

  it('receivers no value satisfies leave nothing to send', () => {
    expectTypeOf<BusDetail<'sdd72-never'>>().toEqualTypeOf<Person & number>();
  });
});

describe('BusArgs and emit — the detail is optional exactly when every receiver admits undefined', () => {
  it('required for a Person, optional for unknown and for number | undefined', () => {
    expectTypeOf<BusArgs<'sdd72-alta'>>().toEqualTypeOf<[detail: Person & { name: string }]>();
    expectTypeOf<BusArgs<'sdd72-ping'>>().toEqualTypeOf<[detail?: unknown]>();
    expectTypeOf<BusArgs<'sdd72-opt'>>().toEqualTypeOf<[detail?: number | undefined]>();
  });

  it('emit is checked against them, and still dispatches what it is given', () => {
    const host = new EventTarget();
    const seen: unknown[] = [];
    host.addEventListener('sdd72-alta', (e) => seen.push((e as CustomEvent).detail));
    const ada: Person = { id: 1, name: 'Ada' };
    const call = emit as unknown as (this: EventTarget, name: string, detail?: unknown) => void;
    call.call(host, 'sdd72-alta', ada);
    expect(seen).toEqual([ada]);
    expect(seen[0]).toBe(ada);

    // Type-level only: never executed.
    if (seen.length < 0) {
      emit('sdd72-alta', ada);
      emit('sdd72-ping');
      emit('sdd72-ping', 3);
      emit('sdd72-nobody', 42);
      emit('sdd72-nobody');
      emit('sdd72-opt');
      const name: string = 'sdd72-alta';
      emit(name, 42);
      emit(name);
      // @ts-expect-error a string is no Person
      emit('sdd72-alta', 'x');
      // @ts-expect-error the detail is required when a receiver does not admit undefined
      emit('sdd72-alta');
      // @ts-expect-error { name } lacks the id the first receiver asks for
      emit('sdd72-alta', { name: 'a' });
    }
  });
});
