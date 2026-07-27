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
    // The emitted SW is an ES module chunk: registering it as a classic script fails.
    expect(register).toHaveBeenCalledWith('/sw.js', { type: 'module' });
  });

  it('lets the caller override the registration options', async () => {
    const registration = { scope: '/' } as unknown as ServiceWorkerRegistration;
    const register = vi.fn(async () => registration);
    vi.stubGlobal('navigator', { serviceWorker: { register } });

    await registerRenderServiceWorker('/sw.js', { type: 'classic', scope: '/app/' });
    expect(register).toHaveBeenCalledWith('/sw.js', { type: 'classic', scope: '/app/' });
  });
});
