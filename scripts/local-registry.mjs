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
 * The client's cached manifests for this registry go with it — see `forgetCachedMetadata`;
 * republishing `0.0.1` over `0.0.1` is invisible to a package manager otherwise.
 *
 * Usage:
 *   node scripts/local-registry.mjs              build, publish, stay up until Ctrl-C
 *   node scripts/local-registry.mjs --no-build   skip the build (the dist folders are current)
 *   node scripts/local-registry.mjs --publish    publish and exit; leaves nothing running
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const STORAGE = join(ROOT, '.local-registry');
const CONFIG = join(HERE, 'verdaccio.yaml');

export const PORT = 4873;
export const REGISTRY = `http://localhost:${PORT}`;

/** How pnpm names this registry's folder inside its metadata cache. */
const CACHE_KEY = `localhost+${PORT}`;

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

/**
 * Where pnpm keeps the registry manifests it caches. `pnpm config get cacheDir` only answers
 * when somebody set it explicitly, so the platform default has to be reproduced here.
 */
function pnpmCacheDir() {
  const asked = spawnSync('pnpm', ['config', 'get', 'cacheDir'], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  const configured = (asked.stdout ?? '').trim();
  if (configured && configured !== 'undefined') return configured;
  if (process.platform === 'win32') return join(process.env.LOCALAPPDATA ?? homedir(), 'pnpm-cache');
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Caches', 'pnpm');
  return join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'pnpm');
}

/**
 * Forget every manifest this registry ever served.
 *
 * This is the client half of the storage wipe below, and without it the whole rehearsal is a
 * lie. The workspace publishes `0.0.1` on every run, and to a package manager `name@version`
 * is immutable: pnpm keeps the manifest under `<cache>/metadata-vN/localhost+4873/@fudic/` and,
 * on the next install, resolves from that copy without asking the registry at all. A
 * brand-new project with no lockfile then installs a tarball from a previous build — one whose
 * `dependencies` predate whatever was added since. The symptom is not a version conflict but a
 * silent hole: a transitive `@fudic/*` that simply never gets installed.
 *
 * Only this registry's folder is removed. `registry.npmjs.org` sits next to it and is real
 * cache worth keeping.
 */
function forgetCachedMetadata() {
  const cache = pnpmCacheDir();
  if (!existsSync(cache)) return;
  for (const entry of readdirSync(cache, { withFileTypes: true })) {
    // `metadata-v1.3` and `metadata-full-v1.3` today; the suffix moves with pnpm's format.
    if (!entry.isDirectory() || !entry.name.startsWith('metadata')) continue;
    const stale = join(cache, entry.name, CACHE_KEY);
    if (!existsSync(stale)) continue;
    console.log(`› forgetting pnpm's cached metadata in ${join(entry.name, CACHE_KEY)}`);
    rmSync(stale, { recursive: true, force: true });
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
  forgetCachedMetadata();

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
