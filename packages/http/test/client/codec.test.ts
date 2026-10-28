/**
 * SDD-56 §4.7 step 4 and SDD-67 §4.1 step 5: a response, as the value or as the error the
 * server threw, read with the function's own format.
 */

import { describe, expect, it } from 'vitest';
import { decode, fromProblem } from '../../src/client/codec.js';
import { HttpError, Redirect, ValidationError, type Problem } from '../../src/errors.js';
import { binWire } from '../../src/wire/bin.js';
import { jsonWire } from '../../src/wire/json.js';
import type { Ty } from '../../src/wire/ty.js';

const BIN = { wire: binWire };
const JSON_ = { wire: jsonWire };

const binValue = (ty: Ty, value: unknown, status = 200): Response =>
  new Response(binWire.encodeValue(ty, value) as BodyInit, { status, headers: { 'content-type': binWire.type } });
const binProblem = (p: Problem): Response =>
  new Response(binWire.encodeProblem(p) as BodyInit, { status: p.status, headers: { 'content-type': binWire.problemType } });
const jsonProblem = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/problem+json' } });

const rejection = async (response: Response, spec = BIN): Promise<HttpError> => {
  const e = await decode(response, spec).catch((x: unknown) => x);
  expect(e).toBeInstanceOf(HttpError);
  return e as HttpError;
};

describe('decode, fud-bin', () => {
  it('a 200 is its value, read by its ->', async () => {
    const ty: Ty = { fields: () => ({ a: 'u8' }) };
    expect(await decode(binValue(ty, { a: 1 }), { ...BIN, returns: ty })).toEqual({ a: 1 });
  });

  it('a 201 is a value too', async () => {
    expect(await decode(binValue({ list: 'u8' }, [1], 201), { ...BIN, returns: { list: 'u8' } })).toEqual([1]);
  });

  it('criterion 4: a date comes back a Date', async () => {
    const at = new Date('2020-02-29T12:00:00.000Z');
    const back = await decode(binValue('date', at), { ...BIN, returns: 'date' });
    expect(back).toBeInstanceOf(Date);
    expect((back as Date).getTime()).toBe(at.getTime());
  });

  it('a 204 is undefined, and so is any 2xx of a function without ->', async () => {
    expect(await decode(new Response(null, { status: 204 }), { ...BIN, returns: 'u8' })).toBeUndefined();
    expect(await decode(binValue('u8', 1), BIN)).toBeUndefined();
  });

  it('criterion 7: a problem+fud rejects with the class its problem says', async () => {
    const e = await rejection(binProblem({ status: 404, title: 'Not Found', detail: 'no such user' }));
    expect(e.constructor).toBe(HttpError);
    expect(e.status).toBe(404);
    expect(e.problem.detail).toBe('no such user');

    const v = await rejection(binProblem({ status: 422, title: 'x', errors: { age: { min: 18 } }, summary: { required: true } }));
    expect(v).toBeInstanceOf(ValidationError);
    expect((v as ValidationError).errors).toEqual({ age: { min: 18 } });
    expect((v as ValidationError).summary).toEqual({ required: true });

    const r = await rejection(binProblem({ status: 303, title: 'See Other', location: '/login' }));
    expect(r).toBeInstanceOf(Redirect);
    expect((r as Redirect).location).toBe('/login');
  });

  it('a problem+json is read too: the 404 of a URL that names no function', async () => {
    const e = await rejection(jsonProblem({ status: 404, title: 'Not Found', detail: 'no such server function' }, 404));
    expect(e.problem.detail).toBe('no such server function');
  });

  it('a body without a content-type is a problem made of its status', async () => {
    const e = await rejection(new Response(null, { status: 502, statusText: 'Bad Gateway' }));
    expect(e.problem).toEqual({ status: 502, title: 'Bad Gateway' });
  });

  it('a body that is neither is a problem made of its status', async () => {
    const e = await rejection(new Response('<h1>bad gateway</h1>', { status: 502, statusText: 'Bad Gateway' }));
    expect(e.problem).toEqual({ status: 502, title: 'Bad Gateway' });
  });

  it('a body that says it is a problem and is not one is a problem made of its status', async () => {
    const broken = new Response(Uint8Array.from([0, 1]), { status: 500, statusText: 'Oops', headers: { 'content-type': binWire.problemType } });
    expect((await rejection(broken)).problem).toEqual({ status: 500, title: 'Oops' });
    const notJson = new Response('{', { status: 500, statusText: 'Oops', headers: { 'content-type': 'application/problem+json; charset=utf-8' } });
    expect((await rejection(notJson)).problem).toEqual({ status: 500, title: 'Oops' });
  });
});

describe('decode, use json', () => {
  it('a 200 is its JSON value, through conform: a date is a Date', async () => {
    const ty: Ty = { fields: () => ({ at: 'date' }) };
    const res = new Response('{"at":"2020-01-01T00:00:00.000Z","extra":1}', { status: 200, headers: { 'content-type': 'application/json' } });
    expect(await decode(res, { ...JSON_, returns: ty })).toEqual({ at: new Date('2020-01-01T00:00:00.000Z') });
  });

  it('a problem+json rejects with its class', async () => {
    const e = await rejection(jsonProblem({ status: 409, title: 'Conflict' }, 409), JSON_);
    expect(e.status).toBe(409);
    const v = await rejection(jsonProblem({ status: 422, title: 'x', errors: { a: { r: true } } }, 422), JSON_);
    expect(v).toBeInstanceOf(ValidationError);
  });

  it('a problem+fud is not its format: a problem made of its status', async () => {
    const e = await rejection(binProblem({ status: 409, title: 'Conflict', detail: 'taken' }), JSON_);
    expect(e.problem).toEqual({ status: 409, title: '' });
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
