import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, test } from 'vitest';
import { injectFrom, token } from '@fudic/di';
import { containerOf } from '@fudic/di/page';
import { standTree } from '../src/providers.js';
import { GREETING } from './fixtures/greeting';

const IOC = fileURLToPath(new URL('./fixtures/unit-ioc.ts', import.meta.url));
const OTHER = token<string>('other');
const SEEDED = token<string>('seeded');

function print(id: string, value: unknown): void {
  const block = document.createElement('script');
  block.type = 'application/json';
  block.id = id;
  block.textContent = JSON.stringify(value);
  document.body.append(block);
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('standTree', () => {
  test('stands the tree the page printed, its owners registered, the seed in its root', async () => {
    print('fud-ioc', [[-1, 0], ['', 'x-unit']]);
    print('fud-di', { seeded: 'from the seed' });
    await standTree(() => IOC, [{ provide: OTHER, use: () => 'from the test' }]);
    expect(injectFrom(containerOf(1), GREETING)).toBe('from the owner module');
    expect(injectFrom(containerOf(1), OTHER)).toBe('from the test');
    expect(injectFrom(containerOf(0), SEEDED)).toBe('from the seed');
  });

  test('a map with no seed', async () => {
    print('fud-ioc', [[-1, 0], ['', 'x-unit']]);
    await standTree(() => IOC, []);
    expect(injectFrom(containerOf(1), SEEDED, { optional: true })).toBeUndefined();
  });

  test('no map: a lone root, fresh, with the overrides', async () => {
    await standTree(() => IOC, [{ provide: GREETING, use: () => 'overridden' }]);
    expect(injectFrom(containerOf(0), GREETING)).toBe('overridden');
    await standTree(() => IOC, []);
    expect(injectFrom(containerOf(0), GREETING)).toBe('from the real service');
  });
});
