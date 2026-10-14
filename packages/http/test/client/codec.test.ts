/**
 * SDD-56 §4.7 step 4: a response, as the value or as the error the server threw.
 */

import { describe, expect, it } from 'vitest';
import { decode, fromProblem } from '../../src/client/codec.js';
import { HttpError, Redirect, ValidationError } from '../../src/errors.js';

const problem = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/problem+json' } });

describe('decode', () => {
  it('a 200 is its JSON value', async () => {
    expect(await decode(new Response('{"a":1}', { status: 200 }))).toEqual({ a: 1 });
  });

  it('a 201 is a value too', async () => {
    expect(await decode(new Response('[1]', { status: 201 }))).toEqual([1]);
  });

  it('a 204 is undefined', async () => {
    expect(await decode(new Response(null, { status: 204 }))).toBeUndefined();
  });

  it('an error rejects with the class its problem says', async () => {
    await expect(decode(problem({ status: 409, title: 'Conflict' }, 409))).rejects.toBeInstanceOf(HttpError);
    await expect(decode(problem({ status: 422, title: 'x', errors: { a: { r: true } } }, 422))).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('an error whose body is not JSON is a problem made of its status', async () => {
    const e = await decode(new Response('<h1>bad gateway</h1>', { status: 502, statusText: 'Bad Gateway' })).catch(
      (x: unknown) => x,
    );
    expect(e).toBeInstanceOf(HttpError);
    expect((e as HttpError).problem).toEqual({ status: 502, title: 'Bad Gateway' });
  });
});

describe('fromProblem', () => {
  it('422 is a ValidationError, with its errors and summary', () => {
    const e = fromProblem({ status: 422, title: 'x', errors: { a: { r: true } }, summary: { s: true } });
    expect(e).toBeInstanceOf(ValidationError);
    expect((e as ValidationError).errors).toEqual({ a: { r: true } });
    expect((e as ValidationError).summary).toEqual({ s: true });
  });

  it.each([301, 302, 303, 307, 308])('a %i with a location is a Redirect', (status) => {
    const e = fromProblem({ status, title: 't', location: '/x' });
    expect(e).toBeInstanceOf(Redirect);
    expect((e as Redirect).location).toBe('/x');
  });

  it('a 3xx without location is a plain HttpError', () => {
    const e = fromProblem({ status: 304, title: 'Not Modified' });
    expect(e).toBeInstanceOf(HttpError);
    expect(e).not.toBeInstanceOf(Redirect);
  });

  it('a location outside 3xx is not a Redirect', () => {
    expect(fromProblem({ status: 201, title: 'x', location: '/y' })).not.toBeInstanceOf(Redirect);
    expect(fromProblem({ status: 400, title: 'x', location: '/y' })).not.toBeInstanceOf(Redirect);
  });

  it('anything else is an HttpError that keeps the problem', () => {
    const p = { status: 404, title: 'Not Found', detail: 'x' };
    const e = fromProblem(p);
    expect(e.constructor).toBe(HttpError);
    expect(e.problem).toBe(p);
  });
});
