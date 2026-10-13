/**
 * SDD-56 §4.8, the table of `errorPages`: a client half only, which navigates or rethrows.
 * `location` is stubbed: what is checked is where it was told to go, and that the call never
 * resolves once it navigates.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorPages } from '../src/error-pages.js';
import { HttpError, ValidationError, conflict, notFound, redirect } from '../src/errors.js';
import { halfOf } from '../src/middleware.js';
import { run } from '../src/compose.js';
import { clientCtx } from './helpers.js';

const assign = vi.fn();
beforeEach(() => {
  assign.mockReset();
  vi.stubGlobal('location', { assign });
});
afterEach(() => vi.unstubAllGlobals());

const step = [halfOf(errorPages, 'client')!];
const failWith = (e: unknown) => run(step, clientCtx(), () => { throw e; });

/** Whether a promise is still pending after the microtasks drained. */
async function pending(p: Promise<unknown>): Promise<boolean> {
  const marker = Symbol('pending');
  const winner = await Promise.race([p, new Promise((r) => setTimeout(() => r(marker), 10))]);
  return winner === marker;
}

describe('errorPages', () => {
  it('has no server half', () => {
    expect(halfOf(errorPages, 'server')).toBeUndefined();
  });

  it('lets a value through untouched', async () => {
    await expect(run(step, clientCtx(), () => ({ a: 1 }))).resolves.toEqual({ a: 1 });
    expect(assign).not.toHaveBeenCalled();
  });

  it('Redirect: location.assign(location), and the call never resolves', async () => {
    const p = failWith(redirect('/login'));
    expect(await pending(p)).toBe(true);
    expect(assign).toHaveBeenCalledWith('/login');
  });

  it('ValidationError: rethrown, it belongs to the form', async () => {
    const e = new ValidationError({ status: 422, title: 'Unprocessable Content' });
    await expect(failWith(e)).rejects.toBe(e);
    expect(assign).not.toHaveBeenCalled();
  });

  it('AbortError: rethrown, the user asked for it', async () => {
    const e = new DOMException('aborted', 'AbortError');
    await expect(failWith(e)).rejects.toBe(e);
    expect(assign).not.toHaveBeenCalled();
  });

  it('another DOMException is not an abort: it navigates to 500', async () => {
    const p = failWith(new DOMException('nope', 'NotAllowedError'));
    expect(await pending(p)).toBe(true);
    expect(assign).toHaveBeenCalledWith('/_fudic/error/500');
  });

  it.each([
    [notFound(), 404],
    [conflict(), 409],
    [new HttpError({ status: 500, title: 'Internal Server Error' }), 500],
  ])('HttpError %#: navigates to /_fudic/error/<status>', async (e, status) => {
    const p = failWith(e);
    expect(await pending(p)).toBe(true);
    expect(assign).toHaveBeenCalledWith(`/_fudic/error/${status}`);
  });

  it('anything else navigates to /_fudic/error/500', async () => {
    const p = failWith(new TypeError('boom'));
    expect(await pending(p)).toBe(true);
    expect(assign).toHaveBeenCalledWith('/_fudic/error/500');
  });
});
