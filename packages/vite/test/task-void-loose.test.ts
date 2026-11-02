/**
 * SDD-74 §3.3: `run()` of a `task` over a function with no arguments takes none — also in an
 * app WITHOUT a `tsconfig.json`, where the build's check infers loose options (no
 * `strictNullChecks`) and `A` of a `Contract<C, R, void>` comes out as `any`. A real build
 * typechecks first, so a build that succeeds is the proof; a call with the wrong argument
 * still fails it, so the check is not simply off.
 */

import { describe, expect, it } from 'vitest';
import { build } from 'vite';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fudic } from '../src/index.js';
import { writeI18nProject } from './helpers/i18n-project.js';

const page = (call: string): string => `<!DOCTYPE html>
<html>
<head>
<script src="fudic:runtime"></script>
<link rel="server" href="./index.fudapi">
<title>Vacío</title>
@code {
  import { task } from '@fudic/core';
  const reservar = task(reserve);
  async function pulsar() {
    ${call}
  }
}
</head>
<body><button @click=@pulsar>Reservar</button></body>
</html>
`;

const API = 'post reserve\n  catches 409\n\npost named\n  n  i32\n';
const SERVER = `import { named, reserve } from 'fudic:routes/index';
reserve.handle(() => undefined);
named.handle(() => undefined);
`;

async function buildWith(call: string): Promise<void> {
  const root = writeI18nProject({
    files: { 'src/routes/index.fud': page(call), 'src/routes/index.fudapi': API, 'src/server/index.ts': SERVER, 'sw.json': '{"shell":[]}' },
  });
  expect(existsSync(join(root, 'tsconfig.json'))).toBe(false);
  await build({ root, logLevel: 'silent', plugins: [fudic()], build: { write: false, minify: false } });
}

describe('a void function in an app with no tsconfig.json', () => {
  it('task(reserve).run() and reserve() compile with no argument; a function with one takes it', async () => {
    await expect(
      buildWith('const r = await reservar.run(); await reserve(); await task(named).run({ n: 1 }); void r;'),
    ).resolves.toBeUndefined();
  }, 240000);

  // Each of these compiles if the functions came in as `any`: failing is the proof they are typed.
  it.each([
    ['a void function given an argument', 'await reserve(5);'],
    ['a function with an argument called without one', 'await task(named).run();'],
    ['a function given an argument of the wrong type', "await task(named).run({ n: 'uno' });"],
  ])('the check sees the generated types: %s fails the build', async (_what, call) => {
    await expect(buildWith(call)).rejects.toThrow(/typecheck failed/u);
  }, 240000);
});
