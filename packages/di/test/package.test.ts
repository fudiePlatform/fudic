import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import config from '../vitest.config.js';

/**
 * The package contract, asserted rather than trusted. Every line here is a promise the
 * rest of the framework leans on: a route without a single `inject` must not download a
 * byte of this package, and an injector that needed the reactivity to exist would be an
 * injector that cannot be tested on its own.
 */
const manifest: {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly sideEffects?: unknown;
  readonly exports?: Readonly<Record<string, unknown>>;
} = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
) as never;

describe('@fudic/di package contract', () => {
  it('declares zero runtime dependencies', () => {
    expect(manifest.dependencies).toBeUndefined();
  });

  it('is free of side effects, so a bundler can drop what nobody calls', () => {
    expect(manifest.sideEffects).toBe(false);
  });

  it('has exactly two entry points: the injector and the page', () => {
    // `./package.json` is not a third entry point — it is the manifest itself, which the
    // Vite plugin has to read to find `fudic.runtime` (SDD-45 §3.3). A package with
    // `exports` hides its own manifest from `require.resolve` unless it says otherwise, so
    // the alternative to this line is the plugin guessing paths inside node_modules.
    expect(Object.keys(manifest.exports ?? {})).toEqual(['.', './page', './package.json']);
  });

  it('runs its suite in node: nothing here may reach for a DOM', () => {
    expect(config.test?.environment).toBe('node');
  });
});
