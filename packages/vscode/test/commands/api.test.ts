/**
 * SDD-75 criteria 8–10, 16 and 17, the extension's half — the commands of a `.fudapi`: from its
 * lens or from the palette, what each asks the server and what it opens or says.
 */

import { describe, expect, it } from 'vitest';
import { API_COMMAND_IDS, API_MODULE_REQUEST, API_REGENERATE_REQUEST, API_TYPES_REQUEST, ApiCommands } from '../../src/commands/api.js';
import { NO_ACTIVE_FUDAPI, SERVER_DOWN } from '../../src/commands/messages.js';
import { commandFixture } from './_deps.js';

const URI = 'file:///work/app/src/routes/usuarios.fudapi';
const SERVER = { name: 'fudic:routes/usuarios.server.ts', text: 'export const save = 1;' };

const run = async (fixture: ReturnType<typeof commandFixture>, id: string, ...args: unknown[]): Promise<ApiCommands> => {
  const api = new ApiCommands(fixture.deps);
  await api.handlers()[id]!(...args);
  return api;
};

describe('the target', () => {
  it('the URI the lens passed, or the active .fudapi from the palette', async () => {
    const fromLens = commandFixture({ answers: { [API_TYPES_REQUEST]: { path: '/t.d.ts' } } });
    await run(fromLens, API_COMMAND_IDS.showTypes, URI);
    expect(fromLens.recording.requests).toEqual([{ method: API_TYPES_REQUEST, params: { uri: URI } }]);

    const fromPalette = commandFixture({ activeFudapiUri: URI, answers: { [API_TYPES_REQUEST]: { path: '/t.d.ts' } } });
    await run(fromPalette, API_COMMAND_IDS.showTypes);
    expect(fromPalette.recording.requests).toEqual([{ method: API_TYPES_REQUEST, params: { uri: URI } }]);
  });

  it('without a .fudapi, or without a server, says so and asks nothing', async () => {
    for (const id of [API_COMMAND_IDS.showTypes, API_COMMAND_IDS.showServer, API_COMMAND_IDS.regenerate]) {
      const none = commandFixture({});
      await run(none, id);
      expect(none.recording.warnings).toEqual([NO_ACTIVE_FUDAPI]);
      const down = commandFixture({ running: false });
      await run(down, id, URI);
      expect(down.recording.warnings).toEqual([SERVER_DOWN]);
      expect([...none.recording.requests, ...down.recording.requests]).toEqual([]);
    }
  });

  it('a request that dies with the server is said, and nothing opens', async () => {
    for (const [id, method] of [
      [API_COMMAND_IDS.showTypes, API_TYPES_REQUEST],
      [API_COMMAND_IDS.showBrowser, API_MODULE_REQUEST],
      [API_COMMAND_IDS.regenerate, API_REGENERATE_REQUEST],
    ] as const) {
      const dying = commandFixture({ rejects: [method] });
      await run(dying, id, URI);
      expect(dying.recording.warnings).toEqual([`Fudic: the ${method} request failed: Error: connection closed`]);
      expect([...dying.recording.files, ...dying.recording.opened, ...dying.recording.infos]).toEqual([]);
    }
  });
});

describe('the commands', () => {
  it('criterion 8: Types opens the file the server names', async () => {
    const fixture = commandFixture({ answers: { [API_TYPES_REQUEST]: { path: '/work/app/.fudic/api/routes/usuarios.d.ts' } } });
    await run(fixture, API_COMMAND_IDS.showTypes, URI);
    expect(fixture.recording.files).toEqual([{ path: '/work/app/.fudic/api/routes/usuarios.d.ts', range: undefined }]);
  });

  it('criterion 9: Server and Browser open the module read-only, as TypeScript, asking for their side', async () => {
    const fixture = commandFixture({ answers: { [API_MODULE_REQUEST]: SERVER } });
    await run(fixture, API_COMMAND_IDS.showServer, URI);
    await run(fixture, API_COMMAND_IDS.showBrowser, URI);
    expect(fixture.recording.requests.map((r) => r.params)).toEqual([
      { uri: URI, side: 'server' },
      { uri: URI, side: 'browser' },
    ]);
    expect(fixture.recording.opened[0]).toEqual({ name: SERVER.name, languageId: 'typescript', text: SERVER.text });
  });

  it('criterion 9: saving the .fudapi refreshes its open views, and only its own', async () => {
    const answers: Record<string, unknown> = { [API_MODULE_REQUEST]: SERVER };
    const fixture = commandFixture({ answers });
    const api = await run(fixture, API_COMMAND_IDS.showServer, URI);
    answers[API_MODULE_REQUEST] = { name: SERVER.name, text: 'export const save = 2;' };
    await api.refresh('file:///work/app/src/routes/otro.fudapi');
    expect(fixture.recording.updated).toEqual([]);
    await api.refresh(URI);
    expect(fixture.recording.updated).toEqual([{ name: SERVER.name, text: 'export const save = 2;' }]);
    // A server that answers with a problem, or dies, leaves the view as it was.
    answers[API_MODULE_REQUEST] = { problem: 'x' };
    await api.refresh(URI);
    expect(fixture.recording.updated).toHaveLength(1);
  });

  it('a refresh whose request dies leaves the view, and says why', async () => {
    const answers: Record<string, unknown> = { [API_MODULE_REQUEST]: SERVER };
    const fixture = commandFixture({ answers });
    const api = await run(fixture, API_COMMAND_IDS.showServer, URI);
    const dying = commandFixture({ rejects: [API_MODULE_REQUEST] });
    // The same views, over a server that is now dying.
    Object.assign(fixture.deps.session, { client: dying.deps.session.client });
    await api.refresh(URI);
    expect(fixture.recording.updated).toEqual([]);
    expect(fixture.recording.warnings).toEqual([`Fudic: the ${API_MODULE_REQUEST} request failed: Error: connection closed`]);
  });

  it('criterion 16: a file never clean warns with the server\'s words and opens nothing', async () => {
    const problem = 'This file has errors; nothing has been generated yet.';
    const fixture = commandFixture({ answers: { [API_MODULE_REQUEST]: { problem } } });
    await run(fixture, API_COMMAND_IDS.showBrowser, URI);
    expect(fixture.recording.warnings).toEqual([problem]);
    expect(fixture.recording.opened).toEqual([]);
  });

  it('criterion 10: Regenerate says how many files it wrote', async () => {
    const two = commandFixture({ answers: { [API_REGENERATE_REQUEST]: { count: 2 } } });
    await run(two, API_COMMAND_IDS.regenerate, URI);
    expect(two.recording.infos).toEqual(['Regenerated 2 files.']);
    const one = commandFixture({ answers: { [API_REGENERATE_REQUEST]: { count: 1 } } });
    await run(one, API_COMMAND_IDS.regenerate, URI);
    expect(one.recording.infos).toEqual(['Regenerated 1 file.']);
  });

  it('criterion 11: the implementation lens opens the file at its call', async () => {
    const fixture = commandFixture({});
    const range = { start: { line: 2, character: 5 }, end: { line: 2, character: 11 } };
    await run(fixture, API_COMMAND_IDS.goToImplementation, '/work/app/src/server/usuarios.ts', range);
    expect(fixture.recording.files).toEqual([{ path: '/work/app/src/server/usuarios.ts', range }]);
  });
});
