/**
 * The local registry (SDD-25-Task-Claude, T-06).
 *
 * `fudic new` generates a `package.json` that asks for `@fudic/*` at their real versions, and
 * none of them is on npm yet — so `pnpm install` inside a generated project dies with a 404
 * and the scaffold cannot be exercised end to end. This publishes the workspace to a Verdaccio
 * running on localhost and leaves it up, so that install resolves.
 *
 * Why a registry and not `pnpm pack` + `file:` or `link:`. A registry needs NO change to the
 * CLI or to the template — only where the install resolves — and it publishes the real tarball,
 * so `files`, `exports` and `publishConfig` are exercised too: a missing `dist` fails here
 * instead of on publication day. `link:` skips packing entirely and risks a second native
 * instance of `oxc-parser`.
 *
 * Verdaccio refuses to republish a version it already has, so the storage is wiped on every
 * run. That is also what keeps the registry honest: what it serves is what this build produced.
 *
 * Usage:
 *   node scripts/local-registry.mjs              build, publish, stay up until Ctrl-C
 *   node scripts/local-registry.mjs --no-build   skip the build (the dist folders are current)
 *   node scripts/local-registry.mjs --publish    publish and exit; leaves nothing running
 */

import { spawn, spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const STORAGE = join(ROOT, '.local-registry');
const CONFIG = join(HERE, 'verdaccio.yaml');

export const PORT = 4873;
export const REGISTRY = `http://localhost:${PORT}`;

/** How long to wait for the registry to answer before giving up, and how often to ask. */
const READY_TIMEOUT_MS = 30_000;
const READY_INTERVAL_MS = 200;

const flags = new Set(process.argv.slice(2));

/** Run a command, inheriting stdio, and fail loudly. Windows needs a shell for `.cmd` shims. */
function run(command, args, cwd = ROOT) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with ${result.status ?? 'no code'}`);
  }
}

/** Poll the registry until it answers. A fetch that throws is "not up yet", not a failure. */
async function waitUntilReady() {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${REGISTRY}/-/ping`);
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, READY_INTERVAL_MS));
  }
  throw new Error(`the registry did not come up at ${REGISTRY} within ${READY_TIMEOUT_MS} ms`);
}

async function main() {
  if (!flags.has('--no-build')) {
    console.log('› building the workspace, so what gets published is what was just built');
    run('pnpm', ['-r', 'build']);
  }

  // A clean storage on every run: Verdaccio rejects republishing 0.0.1 over 0.0.1, and a
  // registry serving a tarball from a previous build is worse than no registry at all.
  console.log(`› wiping ${STORAGE}`);
  rmSync(STORAGE, { recursive: true, force: true });

  console.log(`› starting verdaccio on ${REGISTRY}`);
  const verdaccio = spawn(
    'node',
    [join(ROOT, 'node_modules', 'verdaccio', 'bin', 'verdaccio'), '--config', CONFIG, '--listen', String(PORT)],
    { cwd: ROOT, stdio: 'inherit' },
  );
  const stop = () => {
    verdaccio.kill();
  };
  process.on('exit', stop);
  process.on('SIGINT', () => process.exit(0));

  await waitUntilReady();

  // `--no-git-checks` because the workspace is mid-branch by definition here, and this is not
  // a release. `pnpm` rewrites `workspace:*` into the real version as it packs, which is the
  // other half of why this is a faithful rehearsal.
  console.log('› publishing @fudic/* to the local registry');
  run('pnpm', ['-r', '--filter', './packages/*', 'publish', '--registry', REGISTRY, '--no-git-checks']);

  if (flags.has('--publish')) {
    stop();
    return;
  }

  console.log(`
The registry is up at ${REGISTRY}.

  # a generated project that installs for real:
  npm_config_registry=${REGISTRY} node packages/cli/dist/bin.js new demo --cwd <somewhere>

Ctrl-C stops it. Everything it serves lives in .local-registry/ and is thrown away on the
next run.`);
}

await main();
