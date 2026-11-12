/**
 * SDD-82 §3.10, criterion 38 — `visit(url, { fixture, answers, services })`: the route's fixture,
 * applied as the workbench applies it, with its own bench. `load` hands the named data in order,
 * a function named in `answers` answers without its handler, the services of the group go into
 * each request's root; what the fixture does not name runs for real.
 */

import { describe, expect, test } from 'vitest';
import { readFrames } from '@fudic/http/wire/frames';
import { visit } from '../../src/index.js';
import { clock, rename } from 'fudic:routes/gente';

/** The types of `load` of `routes/gente.fudapi`, which its frames are written with. */
const GENTE = { fields: { title: 'str', names: { list: 'str' } } } as const;
const data = async (): Promise<unknown> => ((await readFrames(GENTE, (await fetch('/_fudic/data/gente')).body!)) as { data: unknown }).data;

describe('the data of the fixture in place of load (criterion 38)', () => {
  test('the page paints what the fixture names, without running load', async () => {
    const page = await visit('/gente', { fixture: 'two' });
    expect(page.status).toBe(200);
    expect(page.document.title).toBe('Two — test');
    expect([...page.document.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['Ana', 'Luis']);
  });

  test('without a fixture, load runs for real', async () => {
    const page = await visit('/gente');
    expect(page.getByRole('heading', { level: 1 })).toHaveTextContent('Real');
  });

  test('several names: each data request after the page takes the next, and the last repeats', async () => {
    await visit('/gente', { fixture: ['two', 'one'] });
    expect(await data()).toEqual({ title: 'One', names: ['Ana'] });
    expect(await data()).toEqual({ title: 'One', names: ['Ana'] });
  });

  test('a failure is the error page of its status; a redirect, what a visit cannot follow', async () => {
    const down = await visit('/gente', { fixture: 'down' });
    expect(down.status).toBe(503);
    expect(down.getByRole('heading', { level: 1 })).toHaveTextContent('503 · The base is down');
    await expect(visit('/gente', { fixture: 'away' })).rejects.toThrow("visit('/gente'): redirected with 303 to /blog/x");
  });
});

describe('the answers and the services of the fixture', () => {
  test('a function named in answers answers without its handler; the last group that names it wins', async () => {
    await visit('/gente', { answers: ['renamed'] });
    expect(await rename()).toBe('renamed by the fixture');
    await visit('/gente', { answers: ['renamed', 'again'] });
    expect(await rename()).toBe('the last one wins');
  });

  test('a function no group names runs for real, and with no fixture line nothing is faked', async () => {
    await visit('/gente', { answers: ['renamed'] });
    expect(await clock()).toBe('the real clock');
    await visit('/gente');
    expect(await rename()).toBe('renamed for real');
  });

  test('the services of the group are what a request resolves', async () => {
    await visit('/gente', { services: 'fixed' });
    expect(await clock()).toBe('the fixture clock');
  });

  test('a route with no .fudapi takes the calls of its fixture', async () => {
    const page = await visit('/contador', { answers: ['none'] });
    expect(page.status).toBe(200);
  });
});

describe('one test does not see the bench of another', () => {
  test('a test that applied a fixture…', async () => {
    await visit('/gente', { fixture: 'two', services: 'fixed' });
    expect(document.cookie).toContain('fudic-bench=');
    expect((globalThis as Record<symbol, unknown>)[Symbol.for('fudic.bench')]).toBeDefined();
  });

  test('…leaves no bench and no cookie to the next', async () => {
    expect(document.cookie).not.toContain('fudic-bench=');
    expect((globalThis as Record<symbol, unknown>)[Symbol.for('fudic.bench')]).toBeUndefined();
    expect(await clock()).toBe('the real clock');
  });
});

describe("what the fixture cannot say: the test's mistakes", () => {
  test('a name the fixture does not have, in each group', async () => {
    await expect(visit('/gente', { fixture: 'three' })).rejects.toThrow(/gente\.fixture\.ts has no data "three" — it has two, one, down, away/u);
    await expect(visit('/gente', { answers: ['nope'] })).rejects.toThrow(/has no calls group "nope" — it has renamed, again/u);
    await expect(visit('/gente', { services: 'nope' })).rejects.toThrow(/has no services group "nope" — it has fixed/u);
    await expect(visit('/contador', { services: 'nope' })).rejects.toThrow(/contador\.fixture\.ts has no services group "nope"$/u);
    // A fixture with no default export names nothing.
    await expect(visit('/espera', { answers: ['a'] })).rejects.toThrow(/espera\.fixture\.ts has no calls group "a"$/u);
  });

  test('data and a fixture both; a fixture for a route without load; a route without fixture', async () => {
    await expect(visit('/gente', { fixture: 'two', data: { title: 'x', names: [] } })).rejects.toThrow('`data` and `fixture` both say what load returns');
    await expect(visit('/contador', { fixture: 'two' })).rejects.toThrow('the route declares no load');
    await expect(visit('/blog/x', { answers: ['a'] })).rejects.toThrow(/the route has no fixture — write .*blog\/\[slug\]\.fixture\.ts/u);
  });
});
