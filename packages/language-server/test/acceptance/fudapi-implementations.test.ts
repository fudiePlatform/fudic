/**
 * SDD-75 criteria 11–15 — over each declaration of a `.fudapi`, who implements it, as the editor
 * asks for it: a real server on a disk the test writes, kept current by the watcher's events.
 *
 * Its own workspace: the handlers written here would be every other suite's too.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import {
  CodeLensRequest,
  DidChangeWatchedFilesNotification,
  FileChangeType,
  type CodeLens,
} from 'vscode-languageserver-protocol/node';
import { copyWorkspace, startHarness, type Harness } from './_harness.js';

const USUARIOS = 'src/routes/usuarios.fudapi';
const AUTH = 'src/middlewares/auth.fudapi';
const GENERATED = new Set(['Types', 'Server', 'Browser', 'Regenerate']);
const HANDLES = "import { save } from 'fudic:routes/usuarios';\n\nsave.handle(() => {});\n";

let harness: Harness;
let root: string;

/** Writes a script and tells the server, as the watcher would. */
async function write(relative: string, text: string | undefined): Promise<void> {
  const type = text === undefined ? FileChangeType.Deleted : FileChangeType.Changed;
  if (text === undefined) rmSync(`${root}/${relative}`);
  else writeFileSync(`${root}/${relative}`, text, 'utf8');
  await harness.client.sendNotification(DidChangeWatchedFilesNotification.type, {
    changes: [{ uri: harness.uriOf(relative), type }],
  });
}

/** The lenses over the declarations: the four of line 1 are `fudapi-generated.test.ts`. */
async function lenses(relative: string): Promise<readonly CodeLens[]> {
  const all = (await harness.client.sendRequest(CodeLensRequest.type, { textDocument: { uri: harness.uriOf(relative) } })) ?? [];
  return all.filter((l) => !GENERATED.has(l.command?.title ?? ''));
}

const titles = async (relative: string): Promise<readonly string[]> => (await lenses(relative)).map((l) => l.command?.title ?? '');

beforeAll(async () => {
  root = copyWorkspace();
  mkdirSync(`${root}/src/routes`, { recursive: true });
  mkdirSync(`${root}/src/middlewares`, { recursive: true });
  mkdirSync(`${root}/src/server`, { recursive: true });
  mkdirSync(`${root}/src/browser`, { recursive: true });
  writeFileSync(`${root}/${USUARIOS}`, 'post save\n  id  i32\n', 'utf8');
  writeFileSync(`${root}/${AUTH}`, 'middleware auth\n  client\n  server\n', 'utf8');
  writeFileSync(`${root}/src/server/usuarios.ts`, HANDLES, 'utf8');
  writeFileSync(`${root}/src/browser/auth.ts`, "import { auth } from 'fudic:middlewares/auth';\n\nauth.client((_ctx, next) => next());\n", 'utf8');
  harness = await startHarness({ root });
  await harness.open(USUARIOS, undefined, 'fudapi');
  await harness.open(AUTH, undefined, 'fudapi');
}, 60_000);

afterAll(async () => {
  await harness.stop();
});

describe('who implements each declaration (SDD-75)', () => {
  it('criterion 11: one handler — `implemented in`, and the click lands on its `.handle(`', async () => {
    const [lens, ...rest] = await lenses(USUARIOS);
    expect(rest).toEqual([]);
    expect(lens!.range.start).toEqual({ line: 0, character: 0 });
    expect(lens!.command).toMatchObject({ title: 'implemented in src/server/usuarios.ts', command: 'fudic.api.goToImplementation' });
    const [file, range] = lens!.command!.arguments as [string, unknown];
    expect(file.endsWith('/src/server/usuarios.ts')).toBe(true);
    expect(range).toEqual({ start: { line: 2, character: 5 }, end: { line: 2, character: 11 } });
  });

  it('criterion 12: the call removed, `not implemented`, with no restart and no click', async () => {
    await write('src/server/usuarios.ts', "import { save } from 'fudic:routes/usuarios';\n");
    const [lens] = await lenses(USUARIOS);
    expect(lens!.command).toEqual({ title: 'not implemented', command: '' });
    await write('src/server/usuarios.ts', HANDLES);
    expect(await titles(USUARIOS)).toEqual(['implemented in src/server/usuarios.ts']);
  });

  it('criterion 13: two files implementing `save`, two lenses', async () => {
    await write('src/server/otro.ts', HANDLES);
    expect(await titles(USUARIOS)).toEqual(['implemented in src/server/otro.ts', 'implemented in src/server/usuarios.ts']);
  });

  it('criterion 14: a middleware says each half', async () => {
    expect(await titles(AUTH)).toEqual(['client: src/browser/auth.ts', 'server: not implemented']);
  });

  it('criterion 15: a script that does not parse costs the others nothing', async () => {
    await write('src/server/roto.ts', "import { save } from 'fudic:routes/usuarios';\n\nsave.handle(\n");
    expect(await titles(USUARIOS)).toEqual(['implemented in src/server/otro.ts', 'implemented in src/server/usuarios.ts']);
    expect(await titles(AUTH)).toEqual(['client: src/browser/auth.ts', 'server: not implemented']);
    await write('src/server/otro.ts', undefined);
    expect(await titles(USUARIOS)).toEqual(['implemented in src/server/usuarios.ts']);
  });
});
