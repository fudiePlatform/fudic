import { describe, expect, it } from 'vitest';
import { t } from '../src/index.js';

describe('the name the compiler replaces (§4.3)', () => {
  it('t() reached at runtime says the module escaped the compiler', () => {
    expect(() => t('Hola')).toThrow(/^compiled away: /u);
    expect(() => t('Hola {name}', { name: 'Ana' })).toThrow(/compiled away/u);
  });
});
