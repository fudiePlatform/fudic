import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import type { Plugin, UserConfig } from 'vite';
import type {} from 'vitest/config';
import { ENVIRONMENT, EXTERNAL, INLINE, SETUP, fudicTest } from '../src/config.js';
import { BASE_URL, FILE_EXPORT, OPTIONS_KEY, RENEW_WINDOW, ROOT_KEY } from '../src/constants.js';
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

  test('puts vitest in the fudic environment at http://localhost/, off the network, with its setup file', () => {
    const config = configOf({});
    expect(config.test?.environment).toBe(ENVIRONMENT);
    expect(config.test?.environmentOptions).toEqual({
      happyDOM: {
        url: BASE_URL,
        settings: {
          disableCSSFileLoading: true,
          disableJavaScriptFileLoading: true,
          handleDisabledFileLoadingAsSuccess: true,
        },
      },
    });
    expect(config.test?.setupFiles).toEqual([SETUP]);
    expect(BASE_URL).toBe('http://localhost/');
  });

  test('runs many files per worker, in processes, unless the project chose otherwise (BUG-51)', () => {
    expect(configOf({}).test).toMatchObject({ pool: 'forks', isolate: false });
    const own = configOf({ test: { pool: 'threads', isolate: true } } as UserConfig);
    expect(own.test).toMatchObject({ pool: 'threads', isolate: true });
  });

  test('provides the project root, the configured one or the working directory', () => {
    expect(configOf({}).test?.provide).toMatchObject({ [ROOT_KEY]: resolve(process.cwd()) });
    expect(configOf({ root: 'app' }).test?.provide).toMatchObject({ [ROOT_KEY]: resolve('app') });
  });

  test('provides the plugin options and the base, for the in-memory server', () => {
    expect(configOf({}).test?.provide?.[OPTIONS_KEY]).toEqual({ base: '/' });
    const plugin = fudicTest({ routesDir: 'src/pages' })[1]!;
    const config = (plugin.config as (user: UserConfig) => UserConfig)({ base: '/app/' });
    expect(config.test?.provide?.[OPTIONS_KEY]).toEqual({ routesDir: 'src/pages', base: '/app/' });
  });

  test('has vitest transform what the harness writes under node_modules', () => {
    expect(configOf({}).test?.server?.deps?.inline).toEqual([INLINE]);
    expect(INLINE.test('/p/node_modules/.fudic-test/wrapper-1.js')).toBe(true);
    expect(INLINE.test('/p/node_modules/vite/index.js')).toBe(false);
    expect(INLINE.test('/p/node_modules/@fudic/vite/dist/index.js')).toBe(false);
  });

  test('transforms @fudic/testing itself when installed from a registry, so its import of a wrapper stays in vitest', () => {
    // Externalized, Node imports the wrapper by a bare Windows path and `visit()` answers 500.
    expect(INLINE.test('/p/node_modules/@fudic/testing/dist/visit.js')).toBe(true);
    expect(INLINE.test('C:\\p\\node_modules\\@fudic\\testing\\dist\\page.js')).toBe(true);
    expect(INLINE.test('C:\\p\\node_modules\\.fudic-test\\wrapper-1.js')).toBe(true);
    expect(INLINE.test('/p/node_modules/@fudic/testing-extra/index.js')).toBe(false);
  });

  test('hands the plugin and the compiler to Node, installed or in a workspace', () => {
    expect(configOf({}).test?.server?.deps?.external).toEqual([EXTERNAL]);
    expect(EXTERNAL.test('/p/node_modules/@fudic/vite/dist/index.js')).toBe(true);
    expect(EXTERNAL.test('C:\\repo\\packages\\compiler\\dist\\index.js')).toBe(true);
    expect(EXTERNAL.test('/p/node_modules/@fudic/core/dist/index.js')).toBe(false);
    expect(EXTERNAL.test('/p/node_modules/vite/dist/node/index.js')).toBe(false);
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

  test('gives the scope a new window when asked, and leaves the last one to the teardown (BUG-51)', async () => {
    const global: Record<PropertyKey, unknown> = { Request: 'node', Response: 'node', Headers: 'node' };
    const env = await environment.setup(global as Record<string, unknown>, {});
    const first = global['document'] as Document;
    const registry = global['customElements'] as CustomElementRegistry;
    registry.define('x-renewed', class extends (global['HTMLElement'] as typeof HTMLElement) {});

    await (global[RENEW_WINDOW] as () => Promise<void>)();

    // A new document and a registry where the tag of the last file is no longer defined.
    expect(global['document']).not.toBe(first);
    expect((global['customElements'] as CustomElementRegistry).get('x-renewed')).toBeUndefined();
    // Node's fetch primitives, put back over the new window's too.
    expect([global['Request'], global['Response'], global['Headers']]).toEqual(['node', 'node', 'node']);

    await env.teardown(global as Record<string, unknown>);
    expect(RENEW_WINDOW in global).toBe(false);
    expect(global['document']).toBeUndefined();
  });

  test('keeps Node’s Request, Response and Headers over happy-dom’s', async () => {
    const global: Record<string, unknown> = { Request: 'node', Response: 'node', Headers: 'node' };
    const env = await environment.setup(global, {});
    expect([global['Request'], global['Response'], global['Headers']]).toEqual(['node', 'node', 'node']);
    expect(global['document']).toBeDefined();
    await env.teardown(global);
  });
});
