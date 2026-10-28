/**
 * SDD-67 §3.7, criterion 20 — `respond` and `respondProblem`: a `Response` written by the test
 * for its `fetch` option, in the function's own format, which the call reads as it reads the
 * server's. Without them a test would answer with `Response.json(…)`, which a binary call does
 * not understand.
 */

import { describe, expect, test } from 'vitest';
import { HttpError, ValidationError } from '@fudic/http';
import { mount, respond, respondProblem } from '../../src/index.js';
import * as XHello from './src/components/x-hello.fud';
import { greet } from 'fudic:components/x-hello';
import { save } from 'fudic:components/x-save';

describe('criterion 20: respond', () => {
  test('a fetch that answers respond(greet, …) makes the call resolve that value', async () => {
    const t = await mount(XHello, { fetch: () => respond(greet, 'Hello, Eva') });
    await t.click(t.getByRole('button'));
    expect(t.getByRole('status')).toHaveTextContent('Hello, Eva');
  });

  test('the call itself resolves the value, read in its format', async () => {
    await mount(XHello, { fetch: () => respond(greet, 'Hi') });
    await expect(greet({ name: 'a' })).resolves.toBe('Hi');
  });

  test('the response is binary, as the server of greet would send it', async () => {
    const response = respond(greet, 'ab');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/fud+bin');
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([2, 0x61, 0x62]);
  });

  test('init is kept: its status and its headers', async () => {
    const response = respond(greet, 'x', { status: 201, headers: { 'x-mine': '1' } });
    expect(response.status).toBe(201);
    expect(response.headers.get('x-mine')).toBe('1');
    expect(response.headers.get('content-type')).toBe('application/fud+bin');
  });

  test('a function without a value, or an undefined value, is a 204', async () => {
    expect(respond(greet, undefined as never).status).toBe(204);
    expect(respond(save, undefined as never).status).toBe(204);
  });
});

describe('criterion 20: respondProblem', () => {
  test('a 409 makes the call reject with an HttpError 409', async () => {
    await mount(XHello, { fetch: () => respondProblem(save, { status: 409, title: 'Conflict' }) });
    const e = await save().catch((x: unknown) => x);
    expect(e).toBeInstanceOf(HttpError);
    expect((e as HttpError).status).toBe(409);
    expect((e as HttpError).problem).toEqual({ status: 409, title: 'Conflict' });
  });

  test('a 422 with its errors is a ValidationError', async () => {
    await mount(XHello, { fetch: () => respondProblem(greet, { status: 422, title: 'Unprocessable Content', errors: { name: { required: true } } }) });
    const e = await greet({ name: '' }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ValidationError);
    expect((e as ValidationError).errors).toEqual({ name: { required: true } });
  });

  test('it is written in the function’s problem format', () => {
    const response = respondProblem(save, { status: 409, title: 'Conflict' });
    expect(response.status).toBe(409);
    expect(response.headers.get('content-type')).toBe('application/problem+fud');
  });
});
