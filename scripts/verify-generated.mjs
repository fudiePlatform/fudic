/**
 * `pnpm verify:generated`: what the generators write passes green without touching it.
 *
 * It builds the packages and publishes them to the local registry, then, in a temporary folder
 * and installing from that registry as a user would, runs every generator of the table below and
 * `pnpm test`, `pnpm spec` and `pnpm build` in each project. It exits 0 only when all of it is
 * green; otherwise it says which command failed and prints its output.
 *
 * Not part of `pnpm test`: it needs a registry, an install and several minutes. It is run when a
 * change to the CLI or its templates lands. A test of the CLI checks that every generator is in
 * `STEPS`, so none can be added without being run here.
 *
 * Usage:
 *   node scripts/verify-generated.mjs              build, publish, generate, check
 *   node scripts/verify-generated.mjs --no-build   the dist folders are current
 *   node scripts/verify-generated.mjs --keep       leave the temporary folder to look at
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const FUDIC = join(ROOT, 'packages', 'cli', 'dist', 'bin.js');

/**
 * The commands, in order, as a user types them. `in` is the folder they run in, inside the
 * temporary one; `covers` is the generator each one exercises (`fudic g <type>`), which is what
 * the test of the CLI compares with its list of generators.
 */
export const STEPS = [
  { in: '.', argv: ['new', 'acme', '--workspace', '--app', 'web', '--uses', 'ui'] },
  { in: 'acme', argv: ['g', 'component', 'acme-button', '--project', 'ui'], covers: 'component' },
  { in: 'acme', argv: ['g', 'page', 'about', '--server', '--project', 'web'], covers: 'page' },
  { in: 'acme', argv: ['g', 'component', 'web-cart', '--project', 'web'] },
  { in: 'acme', argv: ['g', 'api', 'src/components/web-cart', '--project', 'web'], covers: 'api' },
  { in: 'acme', argv: ['g', 'layout', 'docs', '--project', 'web'], covers: 'layout' },
  { in: 'acme', argv: ['g', 'spec', 'acme-badge', '--project', 'ui'], covers: 'spec' },
  { in: 'acme', argv: ['g', 'snippet', 'ui', 'productCard', '--project', 'ui'], covers: 'snippet' },
  { in: 'acme', argv: ['g', 'service', 'cart', '--project', 'web'], covers: 'service' },
  { in: 'acme', argv: ['g', 'form', 'person', '--project', 'web'], covers: 'form' },
  { in: 'acme', argv: ['g', 'pipe', 'truncate', '--project', 'web'], covers: 'pipe' },
  { in: 'acme', argv: ['g', 'style', 'theme', '--project', 'web'], covers: 'style' },
  { in: 'acme', argv: ['g', 'term', 'then', 'cart-has', '--project', 'web'], covers: 'term' },
  { in: 'acme', argv: ['g', 'lib', 'kit'], covers: 'lib' },
  { in: 'acme', argv: ['g', 'app', 'admin'], covers: 'app' },
  { in: 'acme', argv: ['g', 'showcase', 'ui'], covers: 'showcase' },
  { in: '.', argv: ['new', 'solo'] },
  { in: 'solo', argv: ['g', 'component', 'card'] },
  { in: 'solo', argv: ['g', 'api', 'src/components/solo-card'] },
  { in: 'solo', argv: ['g', 'showcase'] },
];

/** The projects checked once everything is generated, and what is run in each. */
export const PROJECTS = ['acme', 'solo'];
export const CHECKS = [['test'], ['spec'], ['build']];

/** Run a command and keep its output; Windows needs a shell for `.cmd` shims. */
function exec(command, args, cwd, env) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', shell: process.platform === 'win32' && command !== process.execPath });
  return { status: result.status ?? 1, output: `${result.stdout ?? ''}${result.stderr ?? ''}${result.error?.message ?? ''}` };
}

async function main() {
  const flags = new Set(process.argv.slice(2));
  const { REGISTRY, startRegistry } = await import('./local-registry.mjs');
  const stop = await startRegistry({ build: !flags.has('--no-build') });
  const at = mkdtempSync(join(tmpdir(), 'fudic-verify-'));
  // Installs resolve `@fudic/*` from the registry the packages were just published to.
  const env = { ...process.env, npm_config_registry: REGISTRY };
  let failed;
  try {
    const run = [
      ...STEPS.map((step) => ({ label: `fudic ${step.argv.join(' ')}`, dir: join(at, step.in), command: process.execPath, args: [FUDIC, ...step.argv] })),
      ...PROJECTS.flatMap((project) => CHECKS.map((args) => ({ label: `${project}: pnpm ${args.join(' ')}`, dir: join(at, project), command: 'pnpm', args }))),
    ];
    for (const step of run) {
      console.log(`› ${step.label}`);
      const { status, output } = exec(step.command, step.args, step.dir, env);
      if (status !== 0) {
        failed = { ...step, status, output };
        break;
      }
    }
  } finally {
    stop();
    if (!flags.has('--keep')) rmSync(at, { recursive: true, force: true });
  }
  if (failed !== undefined) {
    console.error(`\n✗ ${failed.label} exited ${failed.status} in ${failed.dir}\n\n${failed.output}`);
    process.exit(1);
  }
  console.log(`\n✓ every generated project passes test, spec and build${flags.has('--keep') ? ` — kept in ${at}` : ''}`);
}

// Run as a script, not when the test of the CLI imports `STEPS`.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
