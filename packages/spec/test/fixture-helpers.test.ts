/**
 * The helpers a fixture is written with: plain data, never a promise (SDD-82 §3.4) — criterion 8,
 * as values. Their types are checked against a route's `.d.ts` in `@fudic/api`.
 */

import { describe, expect, it } from 'vitest';
import { fails, file, later, redirects, type Answer, type Failed, type FlowFixtures } from '../src/index.js';

describe('the fixture helpers', () => {
  it('fails with a status and a title, or with a code', () => {
    expect(fails(503, 'down')).toEqual({ $fails: { status: 503, title: 'down' } });
    expect(fails(0, 'network')).toEqual({ $fails: { status: 0, title: 'network' } });
    expect(fails('ana')).toEqual({ $fails: { code: 'ana' } });
  });

  it('redirects with 303 unless said otherwise', () => {
    expect(redirects('/entrar')).toEqual({ $redirects: '/entrar', status: 303 });
    expect(redirects('/x', 307)).toEqual({ $redirects: '/x', status: 307 });
  });

  it('file names a file beside the fixture, with its type and name when given', () => {
    expect(file('./a.csv')).toEqual({ $file: './a.csv' });
    expect(file('./a.csv', { type: 'text/csv', name: 'personas.csv' })).toEqual({ $file: './a.csv', type: 'text/csv', name: 'personas.csv' });
  });

  it('later: a value after ms, never, or a failure after ms', () => {
    expect(later(2000, 10)).toEqual({ $later: 2000, value: 10 });
    expect(later.never()).toEqual({ $later: 'never' });
    expect(later.fails(500, 503, 'down')).toEqual({ $later: 500, fails: { status: 503, title: 'down' } });
  });

  it('every helper answers data that survives a round trip through JSON', () => {
    for (const value of [fails(1, 'x'), fails('c'), redirects('/'), file('./f'), later(1, [1]), later.never(), later.fails(1, 2, 'y')]) {
      expect(JSON.parse(JSON.stringify(value))).toEqual(value);
    }
  });

  it('types an answer by its codes', () => {
    const ok: Answer<void, 'ana'> = fails('ana');
    const status: Answer<void, 'ana'> = fails(401, 'no');
    // @ts-expect-error a code the function does not declare
    const wrong: Answer<void, 'ana'> = fails('luis');
    const flow: FlowFixtures = { calls: { 'sin-red': { save: fails(0, 'network') } }, services: {} };
    const failed: Failed = fails(1, 'x');
    expect([ok, status, wrong, flow, failed]).toHaveLength(5);
  });
});
