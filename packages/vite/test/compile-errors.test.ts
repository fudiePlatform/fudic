/**
 * A `.fud` whose expression is broken (`@(`) is a FUD error of the file AND a parse error of
 * the module emitted around it. The author has to read the first: `compileFud` hands back no
 * module, and the pass reports the emit's diagnostics, under `vite build` and `vite dev` alike.
 */

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createServer } from 'vite';

/** When set, `transformFud` answers this code with no diagnostics: Oxc fails on its own. */
const fake = vi.hoisted(() => ({ code: null as string | null }));

vi.mock('../src/transform.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/transform.js')>();
  return {
    ...actual,
    transformFud: (...args: Parameters<typeof actual.transformFud>) => {
      const result = actual.transformFud(...args);
      return fake.code === null || result === null ? result : { ...result, code: fake.code, diagnostics: [] };
    },
  };
});

const { compileFud } = await import('../src/compile.js');
const { nodeIo } = await import('../src/io.js');
const { NO_STYLES } = await import('../src/transform.js');
const { fudic } = await import('../src/index.js');

const BROKEN = `<x-broken>
  <template shadowrootmode="open">
    <p>@(</p>
  </template>
</x-broken>
`;

function project(): { root: string; file: string } {
  const root = mkdtempSync(join(tmpdir(), 'fudic-compile-errors-'));
  const file = join(root, 'x-broken.fud');
  writeFileSync(file, BROKEN);
  return { root, file };
}

describe('a broken expression', () => {
  it('gives no module, and the emit says why', async () => {
    const compiled = (await compileFud(project().file, nodeIo(), undefined, NO_STYLES, undefined))!;
    expect(compiled.module).toBeNull();
    expect(compiled.result.diagnostics.some((d) => d.severity === 'error' && d.code.startsWith('FUD'))).toBe(true);
  });

  it('fails a vite dev import with the FUD diagnostic, not with Oxc', async () => {
    const { root, file } = project();
    const server = await createServer({
      root,
      logLevel: 'silent',
      configFile: false,
      server: { middlewareMode: true, ws: false },
      plugins: [fudic()],
    });
    try {
      const error = await server.ssrLoadModule(file).then(
        () => null,
        (e: unknown) => e as Error,
      );
      expect(error?.message).toMatch(/x-broken\.fud:3:\d+ - error FUD\d{4}/u);
      expect(error?.message).not.toMatch(/PARSE_ERROR/u);
    } finally {
      await server.close();
    }
  });
});

describe('a module Oxc rejects with no FUD error behind it', () => {
  it('is Oxc’s to report: the failure is not swallowed', async () => {
    fake.code = 'const = ;';
    try {
      await expect(compileFud(project().file, nodeIo(), undefined, NO_STYLES, undefined)).rejects.toThrow();
    } finally {
      fake.code = null;
    }
  });
});
