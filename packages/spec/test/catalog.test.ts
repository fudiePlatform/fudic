import { describe, expect, it } from 'vitest';
import { createTermCatalog } from '../src/index.js';
import { FW, ROOTS, WS, memoryFs, termSource } from './terms.js';

describe('createTermCatalog — layers (criteria 11 and 13)', () => {
  it('lets the workspace win when both roots have the term', () => {
    const fs = memoryFs({
      [`${WS}/then/min-height.js`]: termSource('min-height', 'then'),
      [`${FW}/then/min-height.js`]: termSource('min-height', 'then'),
    });
    const module = createTermCatalog(ROOTS, fs).resolve('then', 'min-height');
    expect(module?.layer).toBe('workspace');
    expect(module?.path).toBe(`${WS}/then/min-height.js`);
  });

  it('falls back to the framework, and to nothing', () => {
    const catalog = createTermCatalog(ROOTS, memoryFs({ [`${FW}/then/visible.js`]: termSource('visible', 'then') }));
    expect(catalog.resolve('then', 'visible')?.layer).toBe('framework');
    expect(catalog.resolve('then', 'min-height')).toBeUndefined();
    expect(catalog.resolve('given', 'visible')).toBeUndefined();
  });

  it('keeps the same name in two blocks apart', () => {
    const catalog = createTermCatalog(
      ROOTS,
      memoryFs({
        [`${FW}/given/visible.js`]: termSource('visible', 'given'),
        [`${FW}/then/visible.js`]: termSource('visible', 'then', [{ name: 'target', type: 'element' }]),
      }),
    );
    expect(catalog.resolve('given', 'visible')?.params).toEqual([]);
    expect(catalog.resolve('then', 'visible')?.params).toEqual([{ name: 'target', type: 'element' }]);
    expect(catalog.resolve('given', 'visible')?.diagnostics).toEqual([]);
  });

  it('strips a trailing slash from a root', () => {
    const catalog = createTermCatalog(
      [{ layer: 'framework', path: `${FW}/` }],
      memoryFs({ [`${FW}/then/visible.js`]: termSource('visible', 'then') }),
    );
    expect(catalog.resolve('then', 'visible')?.path).toBe(`${FW}/then/visible.js`);
  });
});

describe('createTermCatalog — list', () => {
  const fs = memoryFs({
    [`${WS}/then/visible.js`]: termSource('visible', 'then'),
    [`${FW}/then/visible.js`]: termSource('visible', 'then'),
    [`${FW}/then/min-height.js`]: termSource('min-height', 'then'),
    [`${FW}/then/README.md`]: '# not a term',
    [`${FW}/then/helper.ts`]: 'export {}',
  });
  const catalog = createTermCatalog(ROOTS, fs);

  it('gives one module per name, the winning one, sorted by name, only .js', () => {
    expect(catalog.list('then').map((m) => [m.name, m.layer])).toEqual([
      ['min-height', 'framework'],
      ['visible', 'workspace'],
    ]);
    expect(catalog.list('when')).toEqual([]);
  });

  it('reads each module once', () => {
    const resolved = catalog.resolve('then', 'visible');
    expect(catalog.list('then')).toContain(resolved);
    expect(fs.reads.filter((p) => p === `${WS}/then/visible.js`)).toHaveLength(1);
  });
});

describe('createTermCatalog — an unreadable module', () => {
  it('is a module with one FUD0941 and no params', () => {
    const path = `${WS}/then/min-height.js`;
    const module = createTermCatalog(ROOTS, memoryFs({ [path]: undefined })).resolve('then', 'min-height');
    expect(module).toMatchObject({ layer: 'workspace', path, block: 'then', name: 'min-height', params: [] });
    expect(module?.diagnostics.map((d) => [d.code, d.span, d.file])).toEqual([['FUD0941', { start: 0, end: 0 }, path]]);
  });
});
