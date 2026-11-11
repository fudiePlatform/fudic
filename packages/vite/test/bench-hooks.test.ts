/**
 * SDD-82 §3.8, §4.2–§4.4, §4.6: the hooks the workbench installs — each criterion with its
 * fixture chosen, its call log, its services made once, its clock — and the server's `Date` on
 * the clock of the criterion whose request is running.
 */

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BENCH_COOKIE,
  BENCH_KEY,
  benchScope,
  cookieOf,
  createBench,
  criterionOfRequest,
  installBench,
  installedBench,
} from '../src/index.js';

const request = (cookie?: string): Request => new Request('http://x/', cookie === undefined ? {} : { headers: { cookie } });
let undo: (() => void) | undefined;

afterEach(() => {
  undo?.();
  undo = undefined;
});

describe('cookieOf', () => {
  it('reads one cookie of a header, decoded', () => {
    expect(cookieOf('a=1; fudic-bench=run.uno%20dos', BENCH_COOKIE)).toBe('run.uno dos');
    expect(cookieOf('a=1;=x; b', 'b')).toBeUndefined();
    expect(cookieOf(null, 'a')).toBeUndefined();
  });
});

describe('a criterion of the bench', () => {
  it('is known by its cookie only while it runs', () => {
    const bench = createBench();
    expect(bench.criterionOf(request(`${BENCH_COOKIE}=r.a`))).toBeUndefined();
    bench.begin('r.a', {});
    expect(bench.criterionOf(request(`${BENCH_COOKIE}=r.a`))).toBe('r.a');
    expect(bench.criterionOf(request())).toBeUndefined();
    bench.end('r.a');
    expect(bench.criterionOf(request(`${BENCH_COOKIE}=r.a`))).toBeUndefined();
  });

  it('hands its data in order for its route, the last one repeating; another route, or none, runs load', () => {
    const bench = createBench();
    bench.begin('c', { route: 'routes/usuarios', data: [{ n: 1 }, { n: 2 }] });
    expect(bench.data('c', 'routes/otra')).toBeUndefined();
    expect([1, 2, 3].map(() => bench.data('c', 'routes/usuarios'))).toEqual([{ value: { n: 1 } }, { value: { n: 2 } }, { value: { n: 2 } }]);
    bench.begin('d', { route: 'routes/usuarios', data: [] });
    expect(bench.data('d', 'routes/usuarios')).toBeUndefined();
    bench.begin('e', {});
    expect(bench.data('e', 'routes/usuarios')).toBeUndefined();
    expect(bench.data('nadie', 'routes/usuarios')).toBeUndefined();
  });

  it('answers what its answers name, `undefined` included; logs every call, a file by its name', () => {
    const bench = createBench();
    bench.begin('c', { answers: { login: undefined, search: ['luis'] } });
    expect(bench.answer('c', 'login', {})).toEqual({ value: undefined });
    expect(bench.answer('c', 'search', {})).toEqual({ value: ['luis'] });
    expect(bench.answer('c', 'save', {})).toBeUndefined();
    expect(bench.answer('nadie', 'save', {})).toBeUndefined();
    bench.called('c', { id: 'routes/u', name: 'save', args: { avatar: new File(['x'], 'marta.png'), docs: [new File([''], 'a.pdf')], n: 1, user: { name: 'm' } }, faked: false, status: 200 });
    bench.called('nadie', { id: 'routes/u', name: 'x', args: {}, faked: false, status: 200 });
    expect(bench.calls('c')).toEqual([
      { id: 'routes/u', name: 'save', args: { avatar: 'marta.png', docs: ['a.pdf'], n: 1, user: { name: 'm' } }, faked: false, status: 200 },
    ]);
    expect(bench.calls('nadie')).toEqual([]);
  });

  it('reads a file(…) of its fixture beside it, with its type and name', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fudic-bench-'));
    writeFileSync(join(dir, 'personas.csv'), 'a,b');
    const bench = createBench();
    bench.begin('c', {
      dir,
      answers: { csv: { $file: './personas.csv', type: 'text/csv' }, renamed: { $later: 10, value: { $file: './personas.csv', name: 'otra.csv' } } },
      route: 'routes/r',
      data: [{ doc: { $file: './personas.csv' } }],
    });
    const csv = bench.answer('c', 'csv', {})!.value as File;
    expect([csv.name, csv.type, await csv.text()]).toEqual(['personas.csv', 'text/csv', 'a,b']);
    const later = bench.answer('c', 'renamed', {})!.value as { value: File };
    expect([later.value.name, later.value.type]).toEqual(['otra.csv', '']);
    expect(((bench.data('c', 'routes/r')!.value as { doc: File }).doc).name).toBe('personas.csv');
    // Without `dir`, relative to the process.
    bench.begin('d', { answers: { a: [1, null] }, route: 'routes/r', data: [{ x: 1 }] });
    expect(bench.answer('d', 'a', {})).toEqual({ value: [1, null] });
    expect(bench.data('d', 'routes/r')).toEqual({ value: { x: 1 } });
  });

  it('counts the answers it hands out that never arrive', () => {
    const bench = createBench();
    bench.begin('c', { answers: { search: { $later: 'never' }, save: 'ok' }, route: 'routes/r', data: [{ rows: [{ total: { $later: 'never' } }] }] });
    expect(bench.held('c')).toBe(0);
    bench.answer('c', 'save', {});
    bench.answer('c', 'search', {});
    bench.data('c', 'routes/r');
    expect(bench.held('c')).toBe(2);
    expect(bench.held('nadie')).toBe(0);
  });

  it('makes each service once for the whole criterion', () => {
    const bench = createBench();
    let made = 0;
    bench.begin('c', { services: [{ provide: 'Users', use: () => ({ n: ++made }) }] });
    const [first] = bench.services('c');
    expect(first!.use()).toBe(first!.use());
    expect(made).toBe(1);
    expect(bench.services('nadie')).toEqual([]);
    bench.begin('d', {});
    expect(bench.services('d')).toEqual([]);
  });

  it('keeps the names of its fixture lines', () => {
    const bench = createBench();
    bench.begin('c', {}, { services: 'dos-personas', answers: ['entra-ana'] });
    bench.begin('d', {});
    expect(bench.names('c')).toEqual({ services: 'dos-personas', answers: ['entra-ana'] });
    expect(bench.names('d')).toEqual({});
    expect(bench.names('nadie')).toBeUndefined();
  });
});

describe('the clock of a criterion (§4.6)', () => {
  it('stands still until advanced, firing the laters it passes in order', async () => {
    const bench = createBench();
    bench.begin('c', { clock: 1000 });
    expect(bench.now('c')).toBe(1000);
    const fired: number[] = [];
    void bench.after('c', 200).then(() => fired.push(200));
    void bench.after('c', 100).then(() => fired.push(100));
    await bench.after('c', 0);
    bench.advance('c', 150);
    await Promise.resolve();
    expect(fired).toEqual([100]);
    bench.advance('c', 100);
    await Promise.resolve();
    expect(fired).toEqual([100, 200]);
    expect(bench.now('c')).toBe(1250);
    // Two that fall due in one step fire in the order of their instants.
    void bench.after('c', 50).then(() => fired.push(50));
    void bench.after('c', 20).then(() => fired.push(20));
    bench.advance('c', 60);
    await Promise.resolve();
    expect(fired).toEqual([100, 200, 20, 50]);
  });

  it('clock stands it at an instant, by name, firing what falls due; a criterion that is not running has none', async () => {
    const bench = createBench();
    bench.begin('c', {}, { services: 's' });
    bench.setClock('c', 5000, '1970-01-01T00:00:05Z');
    expect([bench.now('c'), bench.names('c')]).toEqual([5000, { services: 's', clock: '1970-01-01T00:00:05Z' }]);
    const fired: number[] = [];
    void bench.after('c', 100).then(() => fired.push(100));
    bench.advance('c', 100);
    await Promise.resolve();
    expect(fired).toEqual([100]);
    // A later waiting for the clock is held: it will not arrive until the clock moves.
    void bench.after('c', 50);
    expect(bench.held('c')).toBe(1);
    bench.advance('c', 50);
    expect(bench.held('c')).toBe(0);
    bench.setClock('nadie', 1, 'x');
    expect(bench.now('nadie')).toBeUndefined();
  });

  it('without one, a later waits for real and advance does nothing', async () => {
    const bench = createBench();
    bench.begin('c', {});
    bench.advance('c', 10);
    bench.advance('nadie', 10);
    expect(bench.now('c')).toBeUndefined();
    const start = performance.now();
    await bench.after('c', 20);
    expect(performance.now() - start).toBeGreaterThanOrEqual(15);
  });
});

describe('installBench and the server Date', () => {
  it('puts the hooks on globalThis and takes them away', () => {
    const bench = createBench();
    expect(installedBench()).toBeUndefined();
    expect(criterionOfRequest('fudic-bench=c')).toBeUndefined();
    undo = installBench(bench);
    expect((globalThis as Record<symbol, unknown>)[BENCH_KEY]).toBe(bench);
    bench.begin('c', {});
    expect(criterionOfRequest('fudic-bench=c')).toBe('c');
    expect(criterionOfRequest(undefined)).toBeUndefined();
    undo();
    undo = undefined;
    expect(installedBench()).toBeUndefined();
  });

  it('Date reads the clock of the criterion whose request runs, and only there', () => {
    const bench = createBench();
    undo = installBench(bench);
    const at = Date.parse('2026-11-08T10:00:00Z');
    bench.begin('c', { clock: at });
    bench.begin('d', {});
    benchScope('c', () => {
      expect(Date.now()).toBe(at);
      expect(new Date().getTime()).toBe(at);
      expect(Date()).toBe(new Date(at).toString());
      expect(new Date(5).getTime()).toBe(5);
      expect(Date.UTC(2020, 0, 1)).toBe(Date.parse('2020-01-01T00:00:00Z'));
    });
    benchScope('d', () => expect(Math.abs(Date.now() - performance.timeOrigin - performance.now())).toBeLessThan(1000));
    expect(benchScope(undefined, () => typeof Date())).toBe('string');
    expect(new Date().getTime()).not.toBe(at);
  });
});
