/**
 * SDD-75 criteria 7–10 and 16, the server's half — what a `.fudapi` generates, at a click from its
 * line 1: its types on disk, the module of each side, and its types written again with its
 * dependents'. Opening them in the editor is the extension's half (`packages/vscode`).
 *
 * Its own workspace: the types written here would be every other suite's too.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { emitModule } from '@fudic/api';
import { CodeLensRequest } from 'vscode-languageserver-protocol/node';
import { URI } from 'vscode-uri';
import { API_MODULE_REQUEST, API_REGENERATE_REQUEST, API_TYPES_REQUEST, NOTHING_GENERATED, type ModuleAnswer } from '../../src/fudapi/generated.js';
import { uriToPath } from '../../src/uri.js';
import { copyWorkspace, startHarness, type Harness } from './_harness.js';

const PERSON = 'src/types/person.fudapi';
const USUARIOS = 'src/routes/usuarios.fudapi';
const BROKEN = 'src/routes/roto.fudapi';
const PERSON_TEXT = 'type Person\n  name  str\n';

let harness: Harness;

const types = async (relative: string): Promise<string> =>
  (await harness.client.sendRequest<{ path: string }>(API_TYPES_REQUEST, { uri: harness.uriOf(relative) })).path;
const module = (relative: string, side: 'server' | 'browser'): Promise<ModuleAnswer> =>
  harness.client.sendRequest<ModuleAnswer>(API_MODULE_REQUEST, { uri: harness.uriOf(relative), side });
const regenerate = async (relative: string): Promise<number> =>
  (await harness.client.sendRequest<{ count: number }>(API_REGENERATE_REQUEST, { uri: harness.uriOf(relative) })).count;

/** What `emitModule` gives for the file as the server has it. */
function emitted(relative: string, text: string, side: 'server' | 'browser'): string {
  const { source, index, context } = harness.server.apis.load(uriToPath(URI.parse(harness.uriOf(relative))), text);
  return emitModule(source, index, context, side);
}

beforeAll(async () => {
  const root = copyWorkspace();
  mkdirSync(`${root}/src/types`, { recursive: true });
  mkdirSync(`${root}/src/routes`, { recursive: true });
  writeFileSync(`${root}/${PERSON}`, PERSON_TEXT, 'utf8');
  writeFileSync(`${root}/${USUARIOS}`, 'get list\n  -> Person[]\n', 'utf8');
  writeFileSync(`${root}/src/routes/otro.fudapi`, 'get ping\n', 'utf8');
  writeFileSync(`${root}/${BROKEN}`, 'get\n', 'utf8');
  harness = await startHarness({ root });
  await harness.open(PERSON, undefined, 'fudapi');
}, 60_000);

afterAll(async () => {
  await harness.stop();
});

describe('what a .fudapi generates (SDD-75)', () => {
  it('criterion 7: line 1 has Types, Server, Browser and Regenerate, each with the file', async () => {
    const lenses = (await harness.client.sendRequest(CodeLensRequest.type, { textDocument: { uri: harness.uriOf(PERSON) } })) ?? [];
    expect(lenses.map((l) => [l.range.start.line, l.command?.title, l.command?.command])).toEqual([
      [0, 'Types', 'fudic.api.showTypes'],
      [0, 'Server', 'fudic.api.showServer'],
      [0, 'Browser', 'fudic.api.showBrowser'],
      [0, 'Regenerate', 'fudic.api.regenerate'],
    ]);
    expect(lenses[0]!.command!.arguments).toEqual([harness.uriOf(PERSON)]);
  });

  it('criterion 8: Types is .fudic/api/<id>.d.ts, written again when it was deleted', async () => {
    const path = await types(PERSON);
    expect(path.endsWith('/.fudic/api/types/person.d.ts')).toBe(true);
    rmSync(path);
    expect(await types(PERSON)).toBe(path);
    expect(readFileSync(path, 'utf8')).toContain('Person');
  });

  it('criterion 9: each side is what emitModule gives, and follows the text', async () => {
    for (const side of ['server', 'browser'] as const) {
      expect(await module(USUARIOS, side)).toEqual({ name: `fudic:routes/usuarios.${side}.ts`, text: emitted(USUARIOS, 'get list\n  -> Person[]\n', side) });
    }
    const edited = 'get list\n  -> Person[]\nget count\n  -> u32\n';
    await harness.open(USUARIOS, edited, 'fudapi');
    expect(await module(USUARIOS, 'server')).toEqual({ name: 'fudic:routes/usuarios.server.ts', text: emitted(USUARIOS, edited, 'server') });
    expect((await module(USUARIOS, 'browser')) as { text: string }).toMatchObject({ text: expect.stringContaining('count') });
  });

  it('criterion 10: Regenerate writes again its types and its dependents\', never the others, and counts them', async () => {
    const own = await types(PERSON);
    const dependent = own.replace('/types/person.d.ts', '/routes/usuarios.d.ts');
    const other = own.replace('/types/person.d.ts', '/routes/otro.d.ts');
    const right = readFileSync(own, 'utf8');
    writeFileSync(own, '// edited by hand\n', 'utf8');
    rmSync(dependent, { force: true });
    writeFileSync(other, '// left alone\n', 'utf8');
    expect(await regenerate(PERSON)).toBe(2);
    expect(readFileSync(own, 'utf8')).toBe(right);
    expect(existsSync(dependent)).toBe(true);
    expect(readFileSync(other, 'utf8')).toBe('// left alone\n');
  });

  it('criterion 16: with errors the lenses are there; never clean, the module says so; once clean, the last good one', async () => {
    await harness.open(BROKEN, undefined, 'fudapi');
    const lenses = (await harness.client.sendRequest(CodeLensRequest.type, { textDocument: { uri: harness.uriOf(BROKEN) } })) ?? [];
    expect(lenses.map((l) => l.command?.title)).toEqual(['Types', 'Server', 'Browser', 'Regenerate']);
    expect(await module(BROKEN, 'server')).toEqual({ problem: NOTHING_GENERATED });
    expect(NOTHING_GENERATED).toBe('This file has errors; nothing has been generated yet.');

    const good = await module(PERSON, 'browser');
    await harness.change(harness.uriOf(PERSON), 'type Person\n  name  Nope\n', 2);
    expect(await module(PERSON, 'browser')).toEqual(good);
  });
});
