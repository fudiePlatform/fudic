/**
 * Choosing the server binary (SDD-25 §4.1).
 */

import { describe, expect, it } from 'vitest';
import { resolveServerPath } from '../src/server-path.js';
import type { FileSystemPort } from '../src/ports.js';

const fsWith = (...present: readonly string[]): FileSystemPort => ({
  exists: (path) => present.includes(path),
});

describe('resolveServerPath', () => {
  it('uses the bundled server when the setting is unset', () => {
    expect(resolveServerPath(null, '/ext/dist/server.cjs', fsWith())).toEqual({
      path: '/ext/dist/server.cjs',
      source: 'bundled',
    });
  });

  it('prefers a configured server that is there', () => {
    // The whole point of the setting: developing the server without reinstalling the
    // extension. A setting that lost to the bundled copy would make that meaningless.
    expect(resolveServerPath('/dev/server.js', '/ext/dist/server.cjs', fsWith('/dev/server.js'))).toEqual(
      { path: '/dev/server.js', source: 'setting' },
    );
  });

  it('falls back and says so when the configured server is missing', () => {
    const resolved = resolveServerPath('/gone/server.js', '/ext/dist/server.cjs', fsWith());

    expect(resolved.path).toBe('/ext/dist/server.cjs');
    expect(resolved.source).toBe('bundled');
    expect(resolved.warning).toContain('/gone/server.js');
  });
});
