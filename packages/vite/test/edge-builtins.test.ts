/**
 * The node builtins the edge pass leaves as imports, so `AsyncLocalStorage` is the real one: the
 * request's container of `load` and `layout` is kept in it (SDD-56 §4.6).
 */

import { describe, expect, it } from 'vitest';
import { isNodeBuiltin } from '../src/edge.js';

describe('isNodeBuiltin: what the edge pass leaves as an import', () => {
  it.each(['node:async_hooks', 'node:crypto', 'node:fs/promises', 'fs', 'path', 'crypto', 'async_hooks'])(
    '%s is a builtin',
    (id) => expect(isNodeBuiltin(id)).toBe(true),
  );

  it.each(['@fudic/di', 'vite', './fs', '/src/http.ts', 'fs-extra'])('%s is not', (id) => {
    expect(isNodeBuiltin(id)).toBe(false);
  });
});
