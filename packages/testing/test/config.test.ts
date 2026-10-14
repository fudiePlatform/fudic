import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import { describe, expect, test } from 'vitest';
import type { UserConfig } from 'vite';
import type {} from 'vitest/config';
import { BASE_URL, ENVIRONMENT, fudicTest } from '../src/config.js';
import environment from '../src/environment.js';

function configOf(plugins: ReturnType<typeof fudicTest>): UserConfig {
  const hook = plugins[1]?.config as () => UserConfig;
  return hook();
}

describe('fudicTest', () => {
  test('is the project plugin plus the one that sets the environment', () => {
    expect(fudicTest().map((p) => p.name)).toEqual(['fudic', 'fudic:test']);
  });

  test('takes the same options as fudic()', () => {
    expect(fudicTest({ routesDir: 'src/pages' }).map((p) => p.name)).toEqual(['fudic', 'fudic:test']);
  });

  test('puts vitest in the fudic environment at http://localhost/', () => {
    const config = configOf(fudicTest());
    expect(config.test?.environment).toBe(ENVIRONMENT);
    expect(config.test?.environmentOptions).toEqual({ happyDOM: { url: BASE_URL } });
    expect(BASE_URL).toBe('http://localhost/');
  });

  test('names the environment file next to it, with its own extension', () => {
    expect(basename(ENVIRONMENT)).toBe('environment.ts');
    expect(existsSync(ENVIRONMENT)).toBe(true);
  });
});

describe('the fudic environment', () => {
  test('is happy-dom transformed by the SSR path', () => {
    expect(environment.name).toBe('fudic');
    expect(environment.viteEnvironment).toBe('ssr');
    expect(typeof environment.setup).toBe('function');
  });
});
