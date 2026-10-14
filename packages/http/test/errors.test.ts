/**
 * SDD-56 §3.6: errors are exceptions built from a `Problem`, and give it back unchanged.
 */

import { describe, expect, it } from 'vitest';
import {
  HttpError,
  Redirect,
  ValidationError,
  badRequest,
  conflict,
  forbidden,
  notFound,
  redirect,
  unauthorized,
} from '../src/errors.js';

describe('the factories', () => {
  it.each([
    [badRequest, 400, 'Bad Request'],
    [unauthorized, 401, 'Unauthorized'],
    [forbidden, 403, 'Forbidden'],
    [notFound, 404, 'Not Found'],
    [conflict, 409, 'Conflict'],
  ] as const)('%#: status and title, with and without detail', (make, status, title) => {
    const bare = make();
    expect(bare).toBeInstanceOf(HttpError);
    expect(bare).toBeInstanceOf(Error);
    expect(bare.status).toBe(status);
    expect(bare.problem).toEqual({ status, title });
    expect('detail' in bare.problem).toBe(false);
    expect(bare.message).toBe(title);

    const told = make('x');
    expect(told.problem).toEqual({ status, title, detail: 'x' });
    expect(told.message).toBe('x');
  });

  it('notFound("x") is the problem of criterion 19', () => {
    expect(notFound('x').problem).toEqual({ status: 404, title: 'Not Found', detail: 'x' });
  });
});

describe('redirect', () => {
  it('defaults to 303 See Other', () => {
    const r = redirect('/login');
    expect(r).toBeInstanceOf(Redirect);
    expect(r).toBeInstanceOf(HttpError);
    expect(r.status).toBe(303);
    expect(r.location).toBe('/login');
    expect(r.problem).toEqual({ status: 303, title: 'See Other', location: '/login' });
    expect(r.name).toBe('Redirect');
  });

  it.each([
    [301, 'Moved Permanently'],
    [302, 'Found'],
    [307, 'Temporary Redirect'],
    [308, 'Permanent Redirect'],
  ] as const)('%i is %s', (status, title) => {
    const r = redirect('/x', status);
    expect(r.status).toBe(status);
    expect(r.problem.title).toBe(title);
  });
});

describe('the classes', () => {
  it('an HttpError keeps its Problem as it was given', () => {
    const problem = { status: 418, title: 'Teapot', detail: 'short and stout' };
    const e = new HttpError(problem);
    expect(e.problem).toBe(problem);
    expect(e.status).toBe(418);
    expect(e.name).toBe('HttpError');
    expect(e.message).toBe('short and stout');
  });

  it('a ValidationError carries the errors and the summary', () => {
    const errors = { title: { required: true } };
    const summary = { mismatch: true };
    const e = new ValidationError({ status: 422, title: 'Unprocessable Content', errors, summary });
    expect(e).toBeInstanceOf(HttpError);
    expect(e.name).toBe('ValidationError');
    expect(e.errors).toBe(errors);
    expect(e.summary).toBe(summary);
  });

  it('a ValidationError without errors or summary has null in both', () => {
    const e = new ValidationError({ status: 422, title: 'Unprocessable Content' });
    expect(e.errors).toBeNull();
    expect(e.summary).toBeNull();
  });
});
