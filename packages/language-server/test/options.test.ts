/**
 * Resolution of `initializationOptions` (SDD-24 §3.3).
 *
 * The interesting inputs are the malformed ones: `initialize` params are `unknown`, and the
 * degradation of §6.1 is only reachable if a missing `tsdk` arrives here as an empty string
 * rather than as a thrown `TypeError`.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS, resolveOptions } from '../src/options.js';

describe('resolveOptions', () => {
  it('reads a well-formed payload', () => {
    expect(
      resolveOptions({
        typescript: { tsdk: '/p/node_modules/typescript/lib' },
        fudic: { templateDiagnostics: false, exposeVirtualFiles: true },
      }),
    ).toEqual({
      tsdk: '/p/node_modules/typescript/lib',
      templateDiagnostics: false,
      exposeVirtualFiles: true,
    });
  });

  it('applies the defaults when the `fudic` half is absent', () => {
    expect(resolveOptions({ typescript: { tsdk: '/tsdk' } })).toEqual({
      tsdk: '/tsdk',
      templateDiagnostics: true,
      exposeVirtualFiles: false,
    });
  });

  it.each([
    ['nothing', undefined],
    ['null', null],
    ['a string', 'tsdk'],
    ['a number', 7],
  ])('falls back to every default when the client sends %s', (_label, raw) => {
    expect(resolveOptions(raw)).toEqual(DEFAULT_OPTIONS);
  });

  it.each([
    ['no typescript key', {}],
    ['a typescript that is not an object', { typescript: 'lib' }],
    ['a tsdk that is not a string', { typescript: { tsdk: 42 } }],
  ])('leaves the tsdk empty with %s', (_label, raw) => {
    expect(resolveOptions(raw).tsdk).toBe('');
  });

  it('ignores flags of the wrong type', () => {
    const options = resolveOptions({
      typescript: { tsdk: '/tsdk' },
      fudic: { templateDiagnostics: 'no', exposeVirtualFiles: 1 },
    });

    expect(options.templateDiagnostics).toBe(true);
    expect(options.exposeVirtualFiles).toBe(false);
  });

  it('ignores a `fudic` key that is not an object', () => {
    expect(resolveOptions({ typescript: { tsdk: '/tsdk' }, fudic: true })).toEqual({
      tsdk: '/tsdk',
      templateDiagnostics: true,
      exposeVirtualFiles: false,
    });
  });
});
