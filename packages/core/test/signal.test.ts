import { describe, expect, it } from 'vitest';
import { effect, signal } from '../src/index.js';

describe('signal', () => {
  it('has exactly two operations: call it and set it', () => {
    const s = signal(1);
    expect(s()).toBe(1);
    expect(Object.keys(s)).toEqual(['set']);
    expect((s as unknown as Record<string, unknown>)['peek']).toBeUndefined();
    expect((s as unknown as Record<string, unknown>)['subscribe']).toBeUndefined();
  });

  it('a write notifies', () => {
    const s = signal(1);
    const seen: number[] = [];
    effect(() => void seen.push(s()));
    s.set(2);
    expect(seen).toEqual([1, 2]);
  });

  it('does not notify when Object.is holds (NaN included)', () => {
    const s = signal<number>(NaN);
    let runs = 0;
    effect(() => {
      runs += 1;
      s();
    });
    s.set(NaN);
    expect(runs).toBe(1);
    expect(s()).toBeNaN();
  });

  it('serves several live consumers', () => {
    const s = signal('a');
    const first: string[] = [];
    const second: string[] = [];
    effect(() => void first.push(s()));
    effect(() => void second.push(s()));
    s.set('b');
    expect(first).toEqual(['a', 'b']);
    expect(second).toEqual(['a', 'b']);
  });
});
