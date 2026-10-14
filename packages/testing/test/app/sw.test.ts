import { describe, expect, test } from 'vitest';
import { mount } from '../../src/index.js';
import * as XSave from './src/components/x-save.fud';

/** Run `seen` each time the simulated worker answers. */
function onAnswer(seen: () => void): void {
  const worker = navigator.serviceWorker.controller!;
  const post = worker.postMessage.bind(worker);
  worker.postMessage = ((message: unknown, transfer: Transferable[]) => {
    post(message, transfer);
    seen();
  }) as typeof worker.postMessage;
}

describe('criterion 19: with sw', () => {
  test('a function with .invalidates leaves its paths, and the call waits for the answer', async () => {
    const t = await mount(XSave, { sw: true });
    const status = t.getByRole('status');
    const atAnswer: string[] = [];
    onAnswer(() => atAnswer.push(status.textContent));
    await t.click(t.getByRole('button'));
    // A call that is not a GET also leaves its own page stale (`$fn`): what the page sends.
    expect(t.invalidated).toEqual(['/', '/usuarios']);
    // When the worker answered, the call had not resolved yet; now it has.
    expect(atAnswer).toEqual(['']);
    expect(status).toHaveTextContent('saved');
  });

  test('the worker answers only to invalidations', async () => {
    await mount(XSave, { sw: true });
    expect(() => navigator.serviceWorker.controller!.postMessage({ type: 'fudic:warm' })).not.toThrow();
  });
});

describe('criterion 20: without sw', () => {
  test('the same call resolves, and nothing is invalidated', async () => {
    const t = await mount(XSave);
    expect(navigator.serviceWorker).toBeUndefined();
    await t.click(t.getByRole('button'));
    expect(t.getByRole('status')).toHaveTextContent('saved');
    expect(t.invalidated).toEqual([]);
  });
});

describe('criterion 27: one test does not see the worker of the one before', () => {
  test('the first has one', async () => {
    await mount(XSave, { sw: true });
    expect(navigator.serviceWorker.controller).not.toBeNull();
  });

  test('the second has none', () => {
    expect(navigator.serviceWorker).toBeUndefined();
  });
});
