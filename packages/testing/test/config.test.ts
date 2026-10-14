import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import type { Plugin, UserConfig } from 'vite';
import type {} from 'vitest/config';
import { BASE_URL, ENVIRONMENT, FILE_EXPORT, ROOT_KEY, SETUP, fudicTest } from '../src/config.js';
import environment from '../src/environment.js';

function testPlugin(): Plugin {
  return fudicTest()[1]!;
}

function configOf(user: UserConfig): UserConfig {
  return (testPlugin().config as (user: UserConfig) => UserConfig)(user);
}

function transformOf(code: string, id: string): unknown {
  return (testPlugin().transform as (code: string, id: string) => unknown)(code, id);
}

describe('fudicTest', () => {
  test('is the project plugin plus the one that sets the environment', () => {
    expect(fudicTest().map((p) => p.name)).toEqual(['fudic', 'fudic:test']);
  });

  test('takes the same options as fudic()', () => {
    expect(fudicTest({ routesDir: 'src/pages' }).map((p) => p.name)).toEqual(['fudic', 'fudic:test']);
  });

  test('puts vitest in the fudic environment at http://localhost/, with its setup file', () => {
    const config = configOf({});
    expect(config.test?.environment).toBe(ENVIRONMENT);
    expect(config.test?.environmentOptions).toEqual({ happyDOM: { url: BASE_URL } });
    expect(config.test?.setupFiles).toEqual([SETUP]);
    expect(BASE_URL).toBe('http://localhost/');
  });

  test('provides the project root, the configured one or the working directory', () => {
    expect(configOf({}).test?.provide).toEqual({ [ROOT_KEY]: resolve(process.cwd()) });
    expect(configOf({ root: 'app' }).test?.provide).toEqual({ [ROOT_KEY]: resolve('app') });
  });

  test('has vitest transform what the harness writes under node_modules', () => {
    const [inline] = configOf({}).test?.server?.deps?.inline as RegExp[];
    expect(inline!.test('/p/node_modules/.fudic-test/wrapper-1.js')).toBe(true);
    expect(inline!.test('/p/node_modules/vite/index.js')).toBe(false);
  });

  test('names its files next to it, with its own extension', () => {
    expect(basename(ENVIRONMENT)).toBe('environment.ts');
    expect(basename(SETUP)).toBe('setup.ts');
    expect(existsSync(ENVIRONMENT) && existsSync(SETUP)).toBe(true);
  });
});

describe('the $file export', () => {
  test('a .fud imported plain tells its own file', () => {
    expect(transformOf('export const tag = "x";', '/p/x.fud')).toEqual({
      code: `export const tag = "x";\nexport const ${FILE_EXPORT} = "/p/x.fud";\n`,
      map: null,
    });
  });

  test('nothing else does: a query, a virtual id, another file', () => {
    expect(transformOf('', '/p/x.fud?client')).toBeNull();
    expect(transformOf('', '\0virtual.fud')).toBeNull();
    expect(transformOf('', '/p/x.ts')).toBeNull();
  });
});

describe('the fudic environment', () => {
  test('is happy-dom transformed by the SSR path', () => {
    expect(environment.name).toBe('fudic');
    expect(environment.viteEnvironment).toBe('ssr');
    expect(typeof environment.setup).toBe('function');
  });
});
