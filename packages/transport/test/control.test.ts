import { describe, expect, it, vi } from 'vitest';
import { type ControlMessage, controlBus } from '../src/index.js';

const invalidate: ControlMessage = { type: 'invalidate', route: '/view' };

describe('controlBus (SDD-16 §6.11)', () => {
  it('delivers a posted signal to every subscriber on the channel', async () => {
    const a = controlBus('fud-test-deliver');
    const b = controlBus('fud-test-deliver');
    const fn = vi.fn();
    b.on(fn);
    a.post(invalidate);
    await vi.waitFor(() => {
      expect(fn).toHaveBeenCalledWith(invalidate);
    });
    a.close();
    b.close();
  });

  it('the returned unsubscribe cuts the delivery', async () => {
    const a = controlBus('fud-test-unsub');
    const b = controlBus('fud-test-unsub');
    const fn = vi.fn();
    const off = b.on(fn);
    off();
    a.post(invalidate);
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(fn).not.toHaveBeenCalled();
    a.close();
    b.close();
  });

  it('close() releases the channel', () => {
    const bus = controlBus(); // default 'fudic' name
    expect(() => {
      bus.close();
    }).not.toThrow();
  });

  it('control never travels on a data MessagePort (disjoint channels)', async () => {
    const a = controlBus('fud-test-disjoint');
    const b = controlBus('fud-test-disjoint');
    const { port1, port2 } = new MessageChannel();
    const dataSpy = vi.fn();
    port2.onmessage = dataSpy;
    const fn = vi.fn();
    b.on(fn);
    a.post(invalidate);
    await vi.waitFor(() => {
      expect(fn).toHaveBeenCalled();
    });
    expect(dataSpy).not.toHaveBeenCalled();
    a.close();
    b.close();
    port1.close();
    port2.close();
  });
});
