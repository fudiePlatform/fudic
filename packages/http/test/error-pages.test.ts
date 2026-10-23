/**
 * SDD-56 §4.8, the table of `errorPages`: a client half only, which navigates or rethrows.
 * `location` is stubbed: what is checked is where it was told to go, and that the call never
 * resolves once it navigates.
 *
 * BUG-51: it is a factory now. A status may have a route of its own, `_error.fud` gets the
 * server's `detail` in its URL, and an error the sent form keeps (`$catches`) is the form's.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { form, str } from '@fudic/forms/contract';
import { errorPagesStep, type ErrorRoutes } from '../src/error-pages.js';
import {
  HttpError,
  ValidationError,
  badRequest,
  conflict,
  forbidden,
  notFound,
  redirect,
  unauthorized,
} from '../src/errors.js';
import { run } from '../src/compose.js';
import { generated } from './built-ins.js';
import { clientCtx } from './helpers.js';

const assign = vi.fn();
beforeEach(() => {
  assign.mockReset();
  vi.stubGlobal('location', { assign });
});
afterEach(() => vi.unstubAllGlobals());

/**
 * The client half itself, and (SDD-60 criterion 23) the `error-pages` of
 * `fudapi/middlewares.fudapi` with its half registered from `impl/browser`.
 */
const IMPLEMENTATIONS = [
  ['the step', (routes?: ErrorRoutes) => [errorPagesStep(routes)] as never],
  ['generated from the .fudapi', (routes?: ErrorRoutes) => generated.errorPages(routes)],
] as const;

/** Whether a promise is still pending after the microtasks drained. */
async function pending(p: Promise<unknown>): Promise<boolean> {
  const marker = Symbol('pending');
  const winner = await Promise.race([p, new Promise((r) => setTimeout(() => r(marker), 10))]);
  return winner === marker;
}

describe.each(IMPLEMENTATIONS)('%s', (_name, stepOf) => {
  const failWith = (e: unknown, routes?: ErrorRoutes, args: unknown = undefined) =>
    run(stepOf(routes), { ...clientCtx(), args }, () => { throw e; });

  describe('errorPages', () => {
    it('lets a value through untouched', async () => {
      await expect(run(stepOf(), clientCtx(), () => ({ a: 1 }))).resolves.toEqual({ a: 1 });
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

    it('ValidationError: rethrown even with a route for 422, or a form that does not keep it', async () => {
      const e = new ValidationError({ status: 422, title: 'Unprocessable Content' });
      await expect(failWith(e, { 422: '/never' }, { $catches: () => false })).rejects.toBe(e);
      expect(assign).not.toHaveBeenCalled();
    });

    it('AbortError: rethrown, the user asked for it', async () => {
      const e = new DOMException('aborted', 'AbortError');
      await expect(failWith(e, { 500: '/never' })).rejects.toBe(e);
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

  describe('errorPages: the detail of _error.fud (BUG-51)', () => {
    it('carries the server’s detail in the query, encoded', async () => {
      const p = failWith(unauthorized('sin token & más'));
      expect(await pending(p)).toBe(true);
      expect(assign).toHaveBeenCalledWith('/_fudic/error/401?detail=sin+token+%26+m%C3%A1s');
      const url = new URL(assign.mock.calls[0]![0] as string, 'http://x');
      expect(url.searchParams.get('detail')).toBe('sin token & más');
    });

    it('no query when the detail is absent or empty', async () => {
      const empty = failWith(new HttpError({ status: 403, title: 'Forbidden', detail: '' }));
      expect(await pending(empty)).toBe(true);
      expect(assign).toHaveBeenLastCalledWith('/_fudic/error/403');

      const absent = failWith(forbidden());
      expect(await pending(absent)).toBe(true);
      expect(assign).toHaveBeenLastCalledWith('/_fudic/error/403');
    });

    it('an error that is not an HttpError is a 500 with no detail', async () => {
      const p = failWith(new Error('a message, never a detail'));
      expect(await pending(p)).toBe(true);
      expect(assign).toHaveBeenCalledWith('/_fudic/error/500');
    });
  });

  describe('errorPages: the routes by status (BUG-51)', () => {
    it('a string route is where the status goes, and the call never resolves', async () => {
      const p = failWith(unauthorized('sin token'), { 401: '/login' });
      expect(await pending(p)).toBe(true);
      expect(assign).toHaveBeenCalledWith('/login');
    });

    it('a status with no route goes to _error.fud, routes or not', async () => {
      const p = failWith(notFound('no such user'), { 401: '/login' });
      expect(await pending(p)).toBe(true);
      expect(assign).toHaveBeenCalledWith('/_fudic/error/404?detail=no+such+user');
    });

    it('a Redirect is never routed: it goes to its own location', async () => {
      const p = failWith(redirect('/elsewhere'), { 303: '/never', 302: '/never' });
      expect(await pending(p)).toBe(true);
      expect(assign).toHaveBeenCalledWith('/elsewhere');
    });
  });

  describe('errorPages: what the sent form keeps (BUG-51)', () => {
    it('rethrows a status the form’s $catches keeps, route or not', async () => {
      const e = conflict('taken');
      const $catches = vi.fn((status: number) => status === 409);
      await expect(failWith(e, { 409: '/never' }, { $catches })).rejects.toBe(e);
      expect($catches).toHaveBeenCalledWith(409);
      expect(assign).not.toHaveBeenCalled();
    });

    it('follows the rule of always when $catches says no', async () => {
      const p = failWith(conflict(), {}, { $catches: () => false });
      expect(await pending(p)).toBe(true);
      expect(assign).toHaveBeenCalledWith('/_fudic/error/409');
    });

    it.each([
      ['no args', undefined],
      ['null args', null],
      ['args with no $catches', { name: 'Ana' }],
      ['a $catches that is not a function', { $catches: true }],
    ])('and when nothing keeps it: %s', async (_what, args) => {
      const p = failWith(conflict(), {}, args);
      expect(await pending(p)).toBe(true);
      expect(assign).toHaveBeenCalledWith('/_fudic/error/409');
    });

    it('an error that is not an HttpError never asks the form', async () => {
      const $catches = vi.fn(() => true);
      const p = failWith(new TypeError('boom'), {}, { $catches });
      expect(await pending(p)).toBe(true);
      expect($catches).not.toHaveBeenCalled();
    });

    it('with a real form: its default keeps 400/409/422, and a 401 goes to its route', async () => {
      const f = form({ name: str('') });
      const kept = badRequest();
      await expect(failWith(kept, { 400: '/never' }, f)).rejects.toBe(kept);
      await expect(failWith(conflict(), { 409: '/never' }, f)).rejects.toBeInstanceOf(HttpError);
      expect(assign).not.toHaveBeenCalled();

      const p = failWith(unauthorized(), { 401: '/login' }, f);
      expect(await pending(p)).toBe(true);
      expect(assign).toHaveBeenCalledWith('/login');
    });

    it('with a real form that narrowed what it keeps, the rest is the page’s', async () => {
      const f = form({ name: str('') }, { catches: [422] });
      const p = failWith(conflict('taken'), {}, f);
      expect(await pending(p)).toBe(true);
      expect(assign).toHaveBeenCalledWith('/_fudic/error/409?detail=taken');
    });
  });
});
