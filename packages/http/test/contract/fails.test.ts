/**
 * SDD-60 §3.3, §3.12 — the `fails` of a declaration: `throw SaveFails.reserved()`.
 */

import { describe, expect, it } from 'vitest';
import { fails, titleOf } from '../../src/contract/index.js';
import { HttpError } from '../../src/errors.js';

describe('fails', () => {
  it('each code builds the HttpError its declaration wrote', () => {
    const SaveFails = fails({ reserved: [409, 'Ese nombre está reservado.'], gone: [410] });
    const e = SaveFails.reserved();
    expect(e).toBeInstanceOf(HttpError);
    expect(e.status).toBe(409);
    expect(e.problem).toEqual({ status: 409, title: 'Conflict', detail: 'Ese nombre está reservado.' });
    expect(SaveFails.gone().problem).toEqual({ status: 410, title: 'Gone' });
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
