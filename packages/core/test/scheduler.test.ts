import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineLazy } from '../src/index.js';

let seq = 0;
function freshTag(): string {
  seq += 1;
  return `app-lazy-${seq}`;
}

function ctor(): CustomElementConstructor {
  return class extends HTMLElement {};
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('defineLazy (SDD-14 §6.12)', () => {
  it('eager defines immediately', () => {
    const tag = freshTag();
    const C = ctor();
    defineLazy(tag, C, 'eager');
    expect(customElements.get(tag)).toBe(C);
  });

  it('tolerates an already defined tag (no re-define, no throw)', () => {
    const tag = freshTag();
    const C = ctor();
    defineLazy(tag, C, 'eager');
    expect(() => {
      defineLazy(tag, ctor(), 'eager');
    }).not.toThrow();
    expect(customElements.get(tag)).toBe(C);
  });

  it('interaction (default) defers until pointerdown on a [data-fud-c] host', () => {
    const tag = freshTag();
    const C = ctor();
    document.body.innerHTML = `<div data-fud-c="${tag}"><button>hi</button></div><p>out</p>`;
    defineLazy(tag, C);
    expect(customElements.get(tag)).toBeUndefined();

    document.dispatchEvent(new Event('pointerdown')); // target is not an element
    expect(customElements.get(tag)).toBeUndefined();
    document.querySelector('p')?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(customElements.get(tag)).toBeUndefined(); // outside any host

    document.querySelector('button')?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(customElements.get(tag)).toBe(C);
  });

  it('viewport defines on the first intersecting host and disconnects', () => {
    class FakeIntersectionObserver {
      static instances: FakeIntersectionObserver[] = [];
      disconnected = false;
      readonly observed: unknown[] = [];
      constructor(
        private readonly cb: (entries: Array<{ isIntersecting: boolean }>) => void,
      ) {
        FakeIntersectionObserver.instances.push(this);
      }
      observe(el: unknown): void {
        this.observed.push(el);
      }
      disconnect(): void {
        this.disconnected = true;
      }
      trigger(isIntersecting: boolean): void {
        this.cb([{ isIntersecting }]);
      }
    }
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);

    const tag = freshTag();
    const C = ctor();
    document.body.innerHTML = `<div data-fud-c="${tag}"></div>`;
    defineLazy(tag, C, 'viewport');
    expect(customElements.get(tag)).toBeUndefined();

    const observer = FakeIntersectionObserver.instances[0];
    expect(observer?.observed).toHaveLength(1);
    observer?.trigger(false);
    expect(customElements.get(tag)).toBeUndefined();
    observer?.trigger(true);
    expect(customElements.get(tag)).toBe(C);
    expect(observer?.disconnected).toBe(true);
  });

  it('viewport with no painted host defines immediately', () => {
    const tag = freshTag();
    const C = ctor();
    defineLazy(tag, C, 'viewport');
    expect(customElements.get(tag)).toBe(C);
  });

  it('idle uses requestIdleCallback when available', () => {
    vi.stubGlobal('requestIdleCallback', (cb: () => void) => {
      cb();
      return 1;
    });
    const tag = freshTag();
    const C = ctor();
    defineLazy(tag, C, 'idle');
    expect(customElements.get(tag)).toBe(C);
  });

  it('idle falls back to setTimeout without requestIdleCallback', async () => {
    vi.stubGlobal('requestIdleCallback', undefined);
    const tag = freshTag();
    const C = ctor();
    defineLazy(tag, C, 'idle');
    expect(customElements.get(tag)).toBeUndefined();
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(customElements.get(tag)).toBe(C);
  });
});
