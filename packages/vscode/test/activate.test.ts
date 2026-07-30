/**
 * Activation over the ports (SDD-25 §4.1, §5, criterion 9).
 *
 * No extension host, no process, no `vscode` — which is the point of the port boundary.
 * What is asserted is the behaviour a person would otherwise have to reproduce by breaking
 * their own workspace: no TypeScript, a stale server path, a server that will not start.
 */

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { activateFudic, type FudicHost } from '../src/activate.js';
import type { ClientLaunch, LanguageClientPort } from '../src/ports.js';

const PROJECT = join('/work', 'app');
const PROJECT_TSDK = join(PROJECT, 'node_modules', 'typescript', 'lib');

interface Recording {
  readonly warnings: string[];
  readonly log: string[];
  readonly launches: ClientLaunch[];
  readonly client: LanguageClientPort & { started: number; stopped: number };
}

const hostWith = (
  overrides: {
    settings?: Record<string, unknown>;
    present?: readonly string[];
    folders?: readonly string[];
    failStart?: boolean;
  } = {},
): { host: FudicHost; recording: Recording } => {
  const settings = overrides.settings ?? {};
  const present = overrides.present ?? [join(PROJECT_TSDK, 'typescript.js')];
  const warnings: string[] = [];
  const log: string[] = [];
  const launches: ClientLaunch[] = [];

  const client = {
    started: 0,
    stopped: 0,
    start: async () => {
      client.started += 1;
      if (overrides.failStart === true) throw new Error('server unavailable');
    },
    stop: async () => {
      client.stopped += 1;
    },
    sendRequest: async <T>() => undefined as T,
  };

  const host: FudicHost = {
    config: { get: (id) => settings[id] },
    fs: { exists: (path) => present.includes(path) },
    workspace: { folders: overrides.folders ?? [PROJECT] },
    notifications: { warn: (message) => warnings.push(message) },
    logger: { info: (message) => log.push(message) },
    createClient: (launch) => {
      launches.push(launch);
      return client;
    },
    bundledServerPath: '/ext/dist/server.cjs',
    vscodeTsdk: null,
  };

  return { host, recording: { warnings, log, launches, client } };
};

describe('activateFudic', () => {
  it('starts the bundled server against the project TypeScript, quietly', () => {
    return activateFudic(hostWith().host).then((session) => {
      expect(session.running).toBe(true);
      expect(session.server.source).toBe('bundled');
      expect(session.tsdk.path).toBe(PROJECT_TSDK);
      expect(session.launch.initializationOptions.typescript.tsdk).toBe(PROJECT_TSDK);
    });
  });

  it('warns exactly once when there is no project TypeScript', async () => {
    // Criterion 9: the extension comes up, says so once, and HTML and CSS keep working.
    const { host, recording } = hostWith({ present: [] });
    const session = await activateFudic(host);

    expect(session.running).toBe(true);
    expect(session.tsdk.degraded).toBe(true);
    expect(recording.warnings).toHaveLength(1);

    // The guard is the one the supervisor will reuse, so a crash loop cannot repeat it.
    session.warnOnce(() => recording.warnings.push('again'));
    expect(recording.warnings).toHaveLength(1);
  });

  it('warns about a stale fudic.server.path and starts anyway', async () => {
    const { host, recording } = hostWith({
      settings: { 'fudic.server.path': '/gone/server.js' },
    });
    const session = await activateFudic(host);

    expect(session.server.path).toBe('/ext/dist/server.cjs');
    expect(recording.warnings.some((w) => w.includes('/gone/server.js'))).toBe(true);
  });

  it('honours a configured server that exists', async () => {
    const { host } = hostWith({
      settings: { 'fudic.server.path': '/dev/server.js' },
      present: ['/dev/server.js', join(PROJECT_TSDK, 'typescript.js')],
    });

    expect((await activateFudic(host)).server).toEqual({ path: '/dev/server.js', source: 'setting' });
  });

  it('survives a server that will not start', async () => {
    // §5: the editor must not go down with the server. Colour and the language
    // configuration still work, and the restart command still exists.
    const { host, recording } = hostWith({ failStart: true });
    const session = await activateFudic(host);

    expect(session.running).toBe(false);
    expect(recording.log.some((line) => line.includes('failed to start'))).toBe(true);
  });

  it('reads typescript.tsdk from the same configuration as its own settings', async () => {
    // The setting belongs to the TypeScript extension, not to this one, so it is read
    // unscoped — the same reason `config.get` takes full ids rather than a section.
    const { host } = hostWith({
      settings: { 'typescript.tsdk': '/custom/lib' },
      present: [join('/custom/lib', 'typescript.js')],
    });
    const session = await activateFudic(host);

    expect(session.tsdk).toEqual({ path: '/custom/lib', source: 'setting', degraded: false });
  });

  it('logs what it resolved, because the output channel is the only trace of it', async () => {
    const { host, recording } = hostWith();
    await activateFudic(host);

    expect(recording.log.join('\n')).toContain('server:');
    expect(recording.log.join('\n')).toContain('tsdk:');
    expect(recording.log.join('\n')).toContain('trace: off');
  });
});
