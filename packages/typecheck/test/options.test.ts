/**
 * The compiler options of a check (SDD-35 §4.2, criterion 4).
 *
 * With a `tsconfig.json`, the project's — `.fud` registered, `outDir` dropped, `noEmit` forced.
 * Without one, the options the editor infers for a loose folder, written out as a constant and
 * compared here against the ones Volar's language server actually computes, so the copy cannot
 * drift without this test going red.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
import { getInferredCompilerOptions } from '@volar/language-server/lib/project/inferredCompilerOptions.js';
import type { LanguageServer } from '@volar/language-server';
import { FUD_EXTRA_FILE_EXTENSIONS, INFERRED_OPTIONS, readCommandLine, toPosix } from '../src/index.js';

const EXTENSIONS = [...FUD_EXTRA_FILE_EXTENSIONS];

describe('INFERRED_OPTIONS', () => {
  it("are Volar's inferred options with the editor's default settings", async () => {
    // A server whose user settings say nothing: VS Code with `js/ts.implicitProjectConfig`
    // untouched.
    const server = { configurations: { get: async () => undefined } } as unknown as LanguageServer;

    expect(INFERRED_OPTIONS).toEqual(await getInferredCompilerOptions(server));
  });
});

describe('readCommandLine', () => {
  let root: string;

  beforeAll(() => {
    root = toPosix(mkdtempSync(join(tmpdir(), 'fudic-options-')));
    mkdirSync(join(root, 'with', 'src'), { recursive: true });
    writeFileSync(
      join(root, 'with', 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { strict: true, outDir: 'out', noEmit: false },
        include: ['**/*.ts', '**/*.fud'],
      }),
    );
    writeFileSync(join(root, 'with', 'src', 'a.fud'), '<a-b><template shadowrootmode="open"></template></a-b>\n');
    writeFileSync(join(root, 'with', 'src', 'b.ts'), 'export const b = 1;\n');
    mkdirSync(join(root, 'without'), { recursive: true });
  });

  it('reads the nearest tsconfig.json, with .fud included, no outDir and noEmit forced', () => {
    const line = readCommandLine(ts, `${root}/with/src`, EXTENSIONS);

    expect(line.configFile).toBe(`${root}/with/tsconfig.json`);
    expect(line.options.strict).toBe(true);
    expect(line.options.noEmit).toBe(true);
    expect(line.options).not.toHaveProperty('outDir');
    expect([...line.fileNames].sort()).toEqual([`${root}/with/src/a.fud`, `${root}/with/src/b.ts`]);
  });

  it('falls back to the inferred options, with no file and no config, when there is none', () => {
    // A TypeScript that finds no config, so the answer does not depend on what the temp
    // folder's ancestors happen to hold.
    const none = { ...ts, findConfigFile: () => undefined } as typeof ts;
    const line = readCommandLine(none, `${root}/without`, EXTENSIONS);

    expect(line).toEqual({
      options: { ...INFERRED_OPTIONS, noEmit: true },
      fileNames: [],
      projectReferences: undefined,
    });
    expect(line).not.toHaveProperty('configFile');
  });
});
