import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerRenderServiceWorker } from '../src/index.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('registerRenderServiceWorker', () => {
  it('registers the SW at the given url and returns the registration', async () => {
    const registration = { scope: '/' } as unknown as ServiceWorkerRegistration;
    const register = vi.fn(async () => registration);
    vi.stubGlobal('navigator', { serviceWorker: { register } });

    await expect(registerRenderServiceWorker('/sw.js')).resolves.toBe(registration);
    expect(register).toHaveBeenCalledWith('/sw.js');
  });
});
