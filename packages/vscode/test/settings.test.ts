/**
 * Reading the five settings (SDD-25 §3.2).
 *
 * Every case here is a setting with the wrong type, because that is the case that happens:
 * a workspace file written by hand, a value left over from a rename. None of them may throw
 * — activation continues on defaults or it does not continue at all.
 */

import { describe, expect, it } from 'vitest';
import { readSettings } from '../src/settings.js';
import type { ConfigurationPort } from '../src/ports.js';

const config = (settings: Record<string, unknown>): ConfigurationPort => ({
  get: (id) => settings[id],
});

describe('readSettings', () => {
  it('falls back to the declared defaults when nothing is set', () => {
    expect(readSettings(config({}))).toEqual({
      serverPath: null,
      trace: 'off',
      templateDiagnostics: true,
      formatEnable: true,
      exposeVirtualFiles: false,
    });
  });

  it('takes the values that are set', () => {
    const settings = readSettings(
      config({
        'fudic.server.path': '/srv/fudic-language-server.js',
        'fudic.trace.server': 'verbose',
        'fudic.templateDiagnostics': false,
        'fudic.format.enable': false,
        'fudic.exposeVirtualFiles': true,
      }),
    );

    expect(settings).toEqual({
      serverPath: '/srv/fudic-language-server.js',
      trace: 'verbose',
      templateDiagnostics: false,
      formatEnable: false,
      exposeVirtualFiles: true,
    });
  });

  it('ignores a value of the wrong type instead of failing', () => {
    const settings = readSettings(
      config({
        'fudic.server.path': 42,
        'fudic.trace.server': 'loud',
        'fudic.templateDiagnostics': 'yes',
        'fudic.format.enable': null,
        'fudic.exposeVirtualFiles': 1,
      }),
    );

    expect(settings).toEqual({
      serverPath: null,
      trace: 'off',
      templateDiagnostics: true,
      formatEnable: true,
      exposeVirtualFiles: false,
    });
  });

  it('reads a blank server path as unset, and trims one that is set', () => {
    // A path setting people clear by selecting the text and deleting it leaves `"   "`, and
    // an extension that then tries to spawn a whitespace path fails in a way nobody can read.
    expect(readSettings(config({ 'fudic.server.path': '   ' })).serverPath).toBe(null);
    expect(readSettings(config({ 'fudic.server.path': ' /srv/x.js ' })).serverPath).toBe('/srv/x.js');
  });
});
