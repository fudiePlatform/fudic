/**
 * The four commands (SDD-25 §4.3, criterion 8).
 */

import { describe, expect, it } from 'vitest';
import {
  COMMAND_IDS,
  createHandlers,
  formatDocument,
  registerCommands,
  restartServer,
  showRegistry,
  showVirtualFiles,
} from '../../src/commands/index.js';
import { renderRegistry } from '../../src/commands/registry.js';
import { commandFixture } from './_deps.js';

const URI = 'file:///work/app/blog/[slug].fud';

describe('registration', () => {
  it('registers exactly the five ids package.json contributes', () => {
    // The other half of this assertion lives in the manifest test. A command contributed
    // and not registered fails when picked; one registered and not contributed can never be
    // picked at all — and neither shows up as a test failure anywhere else.
    const registered: string[] = [];
    const { deps } = commandFixture({});

    registerCommands({ register: (id) => registered.push(id) }, deps);

    expect(registered).toEqual([
      'fudic.restartServer',
      'fudic.showVirtualFiles',
      'fudic.showRegistry',
      'fudic.formatDocument',
      'fudic.toggleComment',
    ]);
    expect(Object.values(COMMAND_IDS)).toEqual(registered);
  });

  it('exposes every id as a callable handler', async () => {
    // Every one of the four, not a representative: the map is written by hand, and a
    // mistyped key produces a handler that exists and never runs.
    const { deps } = commandFixture({
      activeUri: URI,
      answers: { 'fudic/virtualFiles': [], 'fudic/componentRegistry': [] },
    });
    const handlers = createHandlers(deps);

    for (const id of Object.values(COMMAND_IDS)) {
      await expect(handlers[id]?.()).resolves.toBeUndefined();
    }
  });
});

describe('fudic.restartServer', () => {
  it('restarts and says nothing when it works', async () => {
    const { deps, recording } = commandFixture({});
    await restartServer(deps);

    expect(recording.restarts).toHaveLength(1);
    expect(recording.warnings).toEqual([]);
  });

  it('works with the server already dead — which is what it is for', async () => {
    // §4.3, and the reason the restart re-resolves everything instead of calling start()
    // again: the causes are a dependency just installed, a branch just changed, a moved
    // tsdk. Relaunching the stale state would fix none of them.
    const { deps, recording } = commandFixture({ running: false });
    await restartServer(deps);

    expect(recording.restarts).toHaveLength(1);
  });

  it('reports a restart that did not bring the server back', async () => {
    const { deps, recording } = commandFixture({ restartSucceeds: false });
    await restartServer(deps);

    expect(recording.warnings[0]).toContain('Fudic output channel');
  });
});

describe('fudic.showVirtualFiles', () => {
  it('opens one read-only editor per virtual, each in its own language', async () => {
    // Criterion 8. Reading the CSS virtual as plain text defeats the point of looking.
    const { deps, recording } = commandFixture({
      activeUri: URI,
      answers: {
        'fudic/virtualFiles': [
          { fileName: '[slug].fud.ts', languageId: 'typescript', text: 'export {}' },
          { fileName: '[slug].fud.server.ts', languageId: 'typescript', text: 'export {}' },
          { fileName: '[slug].fud.0.css', languageId: 'css', text: ':host{}' },
        ],
      },
    });

    await showVirtualFiles(deps);

    expect(recording.requests[0]).toEqual({
      method: 'fudic/virtualFiles',
      params: { uri: URI },
    });
    expect(recording.opened.map((doc) => doc.languageId)).toEqual(['typescript', 'typescript', 'css']);
  });

  it('says so when the active document is not a .fud', async () => {
    const { deps, recording } = commandFixture({ activeUri: undefined });
    await showVirtualFiles(deps);

    expect(recording.warnings[0]).toContain('active .fud');
    expect(recording.requests).toEqual([]);
  });

  it('says so when the server is down', async () => {
    const { deps, recording } = commandFixture({ activeUri: URI, running: false });
    await showVirtualFiles(deps);

    expect(recording.warnings[0]).toContain('Restart Language Server');
    expect(recording.requests).toEqual([]);
  });

  it('survives a server that dies mid-request', async () => {
    // The state check and the answer are not atomic. An unhandled rejection here would land
    // in a console nobody has open.
    const { deps, recording } = commandFixture({ activeUri: URI, rejects: ['fudic/virtualFiles'] });
    await showVirtualFiles(deps);

    expect(recording.warnings[0]).toContain('fudic/virtualFiles');
    expect(recording.opened).toEqual([]);
  });

  it('says so when there are no virtuals rather than opening nothing', async () => {
    const { deps, recording } = commandFixture({ activeUri: URI, answers: { 'fudic/virtualFiles': [] } });
    await showVirtualFiles(deps);

    expect(recording.warnings[0]).toContain('no virtual files');
  });
});

describe('fudic.showRegistry', () => {
  it('dumps tag, href and what it resolved to', async () => {
    const { deps, recording } = commandFixture({
      activeUri: URI,
      answers: {
        'fudic/componentRegistry': [
          { tag: 'app-badge', href: '../components/app-badge.fud', resolved: '/work/app/components/app-badge.fud' },
        ],
      },
    });

    await showRegistry(deps);

    expect(recording.opened[0]?.text).toContain('app-badge');
    expect(recording.opened[0]?.languageId).toBe('plaintext');
  });

  it('says so when the active document is not a .fud', async () => {
    const { deps, recording } = commandFixture({});
    await showRegistry(deps);

    expect(recording.warnings[0]).toContain('active .fud');
  });

  it('survives a server that dies mid-request', async () => {
    const { deps, recording } = commandFixture({
      activeUri: URI,
      rejects: ['fudic/componentRegistry'],
    });
    await showRegistry(deps);

    expect(recording.warnings[0]).toContain('fudic/componentRegistry');
  });
});

describe('renderRegistry', () => {
  it('lines the columns up so an unresolved row is visible at a glance', () => {
    // The whole value of the command is spotting the odd one out in a list of twenty.
    const text = renderRegistry([
      { tag: 'app-badge', href: './app-badge.fud', resolved: '/work/app-badge.fud' },
      { tag: 'site-nav', href: './nav.fud', resolved: null },
    ]);
    const [, , first, second] = text.split('\n');

    expect(first?.indexOf('./app-badge.fud')).toBe(second?.indexOf('./nav.fud'));
    expect(second).toContain('unresolved');
  });

  it('says there is nothing rather than printing an empty table', () => {
    expect(renderRegistry([])).toContain('No <link>');
  });
});

describe('fudic.formatDocument', () => {
  it('asks the editor to format, which routes to the server', async () => {
    const { deps, recording } = commandFixture({ activeUri: URI });
    await formatDocument(deps);

    expect(recording.formatted).toHaveLength(1);
  });

  it('respects fudic.format.enable', async () => {
    const { deps, recording } = commandFixture({ activeUri: URI, formatEnable: false });
    await formatDocument(deps);

    expect(recording.formatted).toEqual([]);
    expect(recording.warnings[0]).toContain('fudic.format.enable');
  });

  it('says so when the active document is not a .fud', async () => {
    const { deps, recording } = commandFixture({});
    await formatDocument(deps);

    expect(recording.formatted).toEqual([]);
    expect(recording.warnings[0]).toContain('active .fud');
  });
});
