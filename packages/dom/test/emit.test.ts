import { describe, it, expect, afterEach, expectTypeOf } from 'vitest';
import { emit } from '../src/emit.js';

/** Captures the first event of `type` seen on `target`. */
function capture(target: EventTarget, type: string): { got: CustomEvent | null } {
  const box: { got: CustomEvent | null } = { got: null };
  target.addEventListener(type, (e) => { box.got = e as CustomEvent; }, { once: true });
  return box;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('emit — developer surface', () => {
  it('exposes only (name, detail?) — the host is never in the type', () => {
    // Guards SDD §5.1: a developer importing `emit` must see channel + detail only.
    expectTypeOf(emit).parameters.toEqualTypeOf<[name: string, detail?: unknown]>();
  });
});

describe('emit — host injected via `this` (compiler: emit.call(host, …))', () => {
  it('dispatches a CustomEvent on the host with the given detail', () => {
    const host = document.createElement('div');
    const box = capture(host, 'carrito');

    emit.call(host, 'carrito', { nombre: 'Café', precio: 3.5 });

    expect(box.got).not.toBeNull();
    expect(box.got?.type).toBe('carrito');
    expect(box.got?.detail).toEqual({ nombre: 'Café', precio: 3.5 });
  });

  it('detail is optional; an omitted detail arrives as null', () => {
    const host = document.createElement('div');
    const box = capture(host, 'ping');

    emit.call(host, 'ping');

    expect(box.got).not.toBeNull();
    expect(box.got?.detail).toBeNull();
  });
});

describe('emit — forces bubbles + composed', () => {
  it('bubbles up to an ancestor listener', () => {
    const host = document.createElement('product-list');
    document.body.appendChild(host);
    const onDoc = capture(document, 'carrito');

    emit.call(host, 'carrito', { precio: 1.2 });

    expect(onDoc.got?.detail).toEqual({ precio: 1.2 });
    expect(onDoc.got?.bubbles).toBe(true);
    expect(onDoc.got?.composed).toBe(true);
  });

  it('crosses the shadow boundary and reaches document (composed)', () => {
    const host = document.createElement('product-list');
    document.body.appendChild(host);
    const root = host.attachShadow({ mode: 'open' });
    const inner = document.createElement('button');
    root.appendChild(inner);
    const onDoc = capture(document, 'carrito');

    // Emitting from a node inside the shadow tree still reaches document.
    emit.call(inner, 'carrito', { nombre: 'Té' });

    expect(onDoc.got).not.toBeNull();
    expect(onDoc.got?.detail).toEqual({ nombre: 'Té' });
  });
});
