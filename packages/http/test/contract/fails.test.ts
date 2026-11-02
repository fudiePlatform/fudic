/**
 * SDD-60 §3.3, §3.12 — the `fails` of a declaration: `throw AuthFails.noSession()`. Since SDD-74
 * (decision 175) the error carries its `code`, which the browser turns into the text of its locale.
 */

import { describe, expect, it } from 'vitest';
import { fails, titleOf } from '../../src/contract/index.js';
import { HttpError } from '../../src/errors.js';

describe('fails', () => {
  it('each code builds the HttpError its declaration wrote', () => {
    const AuthFails = fails({ noSession: [401, 'Sign in first.'], gone: [410] });
    const e = AuthFails.noSession();
    expect(e).toBeInstanceOf(HttpError);
    expect(e.status).toBe(401);
    expect(e.problem).toEqual({ status: 401, title: 'Unauthorized', detail: 'Sign in first.', code: 'noSession' });
    expect(AuthFails.gone().problem).toEqual({ status: 410, title: 'Gone', code: 'gone' });
  });

  it('a new error each time', () => {
    const F = fails({ x: [400] });
    expect(F.x()).not.toBe(F.x());
  });
});

describe('titleOf', () => {
  it('the standard name, or the class of the status', () => {
    expect(titleOf(422)).toBe('Unprocessable Content');
    expect(titleOf(503)).toBe('Service Unavailable');
    expect(titleOf(418)).toBe('Client Error');
    expect(titleOf(599)).toBe('Server Error');
  });
});
