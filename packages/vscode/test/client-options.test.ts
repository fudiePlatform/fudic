/**
 * What the client is launched with (SDD-25 §4.1).
 */

import { describe, expect, it } from 'vitest';
import { FILE_EVENTS, buildClientLaunch } from '../src/client-options.js';
import type { FudicSettings } from '../src/settings.js';

const settings: FudicSettings = {
  serverPath: null,
  trace: 'off',
  templateDiagnostics: true,
  formatEnable: true,
  exposeVirtualFiles: false,
};

describe('buildClientLaunch', () => {
  it('watches the three things that invalidate the server', () => {
    // Missing any one of them is a silent failure with a slow diagnosis: `.fud` and a new
    // component never resolves, `tsconfig` and the program keeps stale options,
    // `package.json` and the server keeps typechecking with the previous TypeScript.
    expect(buildClientLaunch(settings, '/srv.js', '/lib').fileEvents).toEqual(FILE_EVENTS);
    expect(FILE_EVENTS).toEqual(['**/*.fud', '**/tsconfig*.json', '**/package.json']);
  });

  it('selects file-scheme fudic documents only', () => {
    expect(buildClientLaunch(settings, '/srv.js', '/lib').documentSelector).toEqual([
      { scheme: 'file', language: 'fudic' },
    ]);
  });

  it('passes the tsdk and the two fudic options the server declares', () => {
    const launch = buildClientLaunch(
      { ...settings, templateDiagnostics: false, exposeVirtualFiles: true },
      '/srv.js',
      '/lib',
    );

    expect(launch.initializationOptions).toEqual({
      typescript: { tsdk: '/lib' },
      fudic: { templateDiagnostics: false, exposeVirtualFiles: true },
    });
  });

  it('passes an empty tsdk through when degraded', () => {
    // The server's own contract: an absent tsdk arrives as an empty string, not as a
    // missing field, so it degrades instead of throwing on a missing property.
    expect(buildClientLaunch(settings, '/srv.js', '').initializationOptions.typescript.tsdk).toBe('');
  });
});
