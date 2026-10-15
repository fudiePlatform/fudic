import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as main from '../src/index.js';
import * as runtime from '../src/runtime/index.js';

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));
/** A built piece, loaded by URL: `runtime/` is a bundle and publishes no declarations. */
const piece = async <T>(name: string): Promise<T> =>
  (await import(/* @vite-ignore */ new URL(`../runtime/${name}.js`, import.meta.url).href)) as T;

describe('what the package exports', () => {
  it('the entry point names the presets, the compiled-away names, the pieces and the catalog', () => {
    expect(Object.keys(main).sort()).toEqual(
      [
        '$format',
        '$href',
        '$message',
        'catalogPathOf',
        'compileMessage',
        'currency',
        'date',
        'format',
        'joinCatalogs',
        'list',
        'locale',
        'mergeCatalog',
        'messageKey',
        'number',
        'parseCatalog',
        'percent',
        'printCatalog',
        'relativeTime',
        'shapeOf',
        'splitCatalog',
        't',
      ].sort(),
    );
  });

  it('the runtime entry names the three pieces, the same functions', () => {
    expect(Object.keys(runtime).sort()).toEqual(['$format', '$href', '$message']);
    expect(runtime.$format).toBe(main.$format);
    expect(runtime.$message).toBe(main.$message);
    expect(runtime.$href).toBe(main.$href);
  });

  it('package.json publishes runtime/ as the fudic runtime (SDD-45)', () => {
    const pkg = JSON.parse(readFileSync(here('../package.json'), 'utf8')) as {
      fudic: { runtime: string };
      files: string[];
    };

    expect(pkg.fudic.runtime).toBe('./runtime');
    expect(pkg.files).toContain('runtime');
  });
});

describe('the built runtime: one closed piece per file (task 13)', () => {
  it.each([
    ['format', '$format'],
    ['message', '$message'],
    ['href', '$href'],
  ])('runtime/%s.js exists, imports nothing and exports %s', async (base, name) => {
    const file = here(`../runtime/${base}.js`);
    expect(existsSync(file)).toBe(true);
    expect(existsSync(`${file}.map`)).toBe(true);

    expect(readFileSync(file, 'utf8')).not.toMatch(/\bimport\b/u);
    const mod = await piece<Record<string, unknown>>(base);
    expect(Object.keys(mod)).toEqual([name]);
  });

  it('the built pieces behave as the source', async () => {
    const built = {
      ...(await piece<Pick<typeof runtime, '$href'>>('href')),
      ...(await piece<Pick<typeof runtime, '$format'>>('format')),
      ...(await piece<Pick<typeof runtime, '$message'>>('message')),
    };
    const m = main.compileMessage('{n, plural, one {# item} other {# items}}', 'en').value;

    expect(built.$href('/about', 'en', ['es', 'en'])).toBe('/en/about');
    expect(built.$format(main.currency('EUR'), 3.5, 'en')).toBe('€3.50');
    expect(built.$message(m, { n: 1 }, 'en')).toBe('1 item');
  });
});
