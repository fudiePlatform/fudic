/**
 * Criterion 38: `@fudic/server` loads where there is only `Request`, `Response` and `crypto`.
 *
 * A child Node process imports the package's main entry with a resolve hook that refuses every
 * Node built-in and `vite`, whoever asks for it: the entry, or anything it reaches. The built
 * `dist` is what an adapter imports, so that is what is loaded.
 */

import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const entry = fileURLToPath(new URL('../dist/index.js', import.meta.url));
const nodeEntry = fileURLToPath(new URL('../dist/node/index.js', import.meta.url));

/** Run `entry` under the hook; its exit status and what it printed. */
function importIsolated(target: string): { status: number | null; out: string } {
  const dir = mkdtempSync(join(tmpdir(), 'fudic-portable-'));
  const hooks = join(dir, 'hooks.mjs');
  writeFileSync(
    hooks,
    [
      "import { builtinModules } from 'node:module';",
      'const builtins = new Set(builtinModules);',
      'export async function resolve(specifier, context, next) {',
      "  const bare = specifier.startsWith('node:') ? specifier.slice(5) : specifier;",
      "  if (specifier.startsWith('node:') || builtins.has(bare.split('/')[0]) || specifier === 'vite' || specifier.startsWith('vite/')) {",
      "    throw new Error(`refused: ${specifier} from ${context.parentURL}`);",
      '  }',
      '  return next(specifier, context);',
      '}',
    ].join('\n'),
  );
  const register = join(dir, 'register.mjs');
  writeFileSync(register, `import { register } from 'node:module';\nregister(${JSON.stringify(pathToFileURL(hooks).href)});\n`);
  const run = spawnSync(
    process.execPath,
    ['--import', pathToFileURL(register).href, '--input-type=module', '-e', `const m = await import(${JSON.stringify(pathToFileURL(target).href)}); console.log(typeof m.createServer);`],
    { encoding: 'utf8' },
  );
  return { status: run.status, out: `${run.stdout}${run.stderr}` };
}

describe('criterion 38: no Node, no Vite', () => {
  it('the package is built', () => {
    expect(existsSync(entry)).toBe(true);
  });

  it('the main entry, and all it reaches, loads with every built-in refused', () => {
    const { status, out } = importIsolated(entry);
    expect(out).toContain('function');
    expect(status).toBe(0);
  });

  it('the hook does refuse: /node, which is for Node, does not load under it', () => {
    const { status, out } = importIsolated(nodeEntry);
    expect(status).not.toBe(0);
    expect(out).toContain('refused: node:');
  });
});
