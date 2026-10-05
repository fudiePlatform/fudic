/**
 * `guardUrl` in a runtime with no Vite at all: the server of a published app, which reads
 * `@fudic/ssr` (and with it this module) straight from `node_modules`. There `import.meta.env`
 * does not exist, and reading `DEV` through it must neither throw nor warn.
 *
 * The rest of this suite runs under Vitest, which is Vite and always has an `env`, so this one
 * case runs in a child Node process. `url.ts` imports nothing, and Node strips its types.
 */

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

// Paths through `node:path`: this suite runs under happy-dom, whose global `URL` is not Node's.
const PACKAGE = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL_TS = pathToFileURL(join(PACKAGE, 'src', 'url.ts')).href;

const SCRIPT = `
const warned = [];
console.warn = (...args) => warned.push(args.join(' '));
const { guardUrl } = await import(${JSON.stringify(URL_TS)});
const written = guardUrl('a', 'href', 'javascript:x');
process.stdout.write(JSON.stringify({ env: typeof import.meta.env, written, warned }));
`;

describe('guardUrl — outside Vite', () => {
  it('replaces the value without throwing and without the development warning', () => {
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', SCRIPT], {
      cwd: PACKAGE,
      encoding: 'utf8',
    });
    expect(JSON.parse(out)).toEqual({ env: 'undefined', written: 'about:blank', warned: [] });
  });
});
