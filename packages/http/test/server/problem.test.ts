/**
 * SDD-56 §4.6 step 6: an error, as the response that carries it.
 */

import { describe, expect, it } from 'vitest';
import { conflict, redirect } from '../../src/errors.js';
import { PROBLEM_TYPE, problemOf, problemResponse } from '../../src/server/problem.js';

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
  it('carries the status, problem+json and the problem as body', async () => {
    const res = problemResponse({ status: 409, title: 'Conflict', detail: 'taken' });
    expect(res.status).toBe(409);
    expect(res.headers.get('content-type')).toBe(PROBLEM_TYPE);
    expect(PROBLEM_TYPE).toBe('application/problem+json');
    expect(await res.json()).toEqual({ status: 409, title: 'Conflict', detail: 'taken' });
  });

  it('a Redirect keeps its location in the body and sends no Location header', async () => {
    const res = problemResponse(redirect('/login', 302).problem);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBeNull();
    expect((await res.json()).location).toBe('/login');
  });
});
