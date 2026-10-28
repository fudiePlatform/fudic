/**
 * SDD-56 §4.6 step 6 and SDD-67 §3.2: an error, as the response that carries it, in the
 * function's format.
 */

import { describe, expect, it } from 'vitest';
import { conflict, redirect } from '../../src/errors.js';
import { noFunction, PROBLEM_TYPE, problemOf, problemResponse } from '../../src/server/problem.js';
import { binWire } from '../../src/wire/bin.js';

const bytes = async (res: Response): Promise<Uint8Array> => new Uint8Array(await res.arrayBuffer());

describe('problemOf', () => {
  it('an HttpError gives its own problem, dev or not', () => {
    const e = conflict('taken');
    expect(problemOf(e, false)).toBe(e.problem);
    expect(problemOf(e, true)).toBe(e.problem);
  });

  it('anything else is a 500, with the message only in dev', () => {
    expect(problemOf(new Error('secreto'), false)).toEqual({ status: 500, title: 'Internal Server Error' });
    expect(problemOf(new Error('secreto'), true)).toEqual({
      status: 500,
      title: 'Internal Server Error',
      detail: 'secreto',
    });
    expect(problemOf(42, true).detail).toBe('42');
  });
});

describe('problemResponse', () => {
  it('by default, problem+json with the problem as body', async () => {
    const res = problemResponse({ status: 409, title: 'Conflict', detail: 'taken' });
    expect(res.status).toBe(409);
    expect(res.headers.get('content-type')).toBe(PROBLEM_TYPE);
    expect(PROBLEM_TYPE).toBe('application/problem+json');
    expect(await res.json()).toEqual({ status: 409, title: 'Conflict', detail: 'taken' });
  });

  it('in fud-bin: problem+fud, the problem as its level', async () => {
    const res = problemResponse({ status: 409, title: 'Conflict', detail: 'taken' }, binWire);
    expect(res.status).toBe(409);
    expect(res.headers.get('content-type')).toBe('application/problem+fud');
    expect(binWire.decodeProblem(await bytes(res))).toEqual({ status: 409, title: 'Conflict', detail: 'taken' });
  });

  it('a Redirect keeps its location in the body and sends no Location header, in both formats', async () => {
    const json = problemResponse(redirect('/login', 302).problem);
    expect(json.status).toBe(302);
    expect(json.headers.get('location')).toBeNull();
    expect((await json.json()).location).toBe('/login');

    const bin = problemResponse(redirect('/login', 302).problem, binWire);
    expect(bin.headers.get('location')).toBeNull();
    expect(binWire.decodeProblem(await bytes(bin)).location).toBe('/login');
  });
});

describe('criterion 14: noFunction, the 404 of a URL that names no function', () => {
  const problem = { status: 404, title: 'Not Found', detail: 'no such server function' };

  it('in problem+json to whoever accepts JSON', async () => {
    const res = noFunction(new Request('https://app.test/_fudic/fn/x', { headers: { accept: 'application/json, */*' } }));
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toBe('application/problem+json');
    expect(await res.json()).toEqual(problem);
  });

  it('in problem+fud to everyone else', async () => {
    for (const headers of [{}, { accept: '*/*' }]) {
      const res = noFunction(new Request('https://app.test/_fudic/fn/x', { headers }));
      expect(res.status).toBe(404);
      expect(res.headers.get('content-type')).toBe('application/problem+fud');
      expect(binWire.decodeProblem(await bytes(res))).toEqual(problem);
    }
  });
});
