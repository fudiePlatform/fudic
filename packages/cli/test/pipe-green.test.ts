/**
 * SDD-71 criterion 14 and §4.6 (BUG-50): `fudic g pipe` in an app and in a library just created,
 * and what it wrote passes untouched — the project's own `vitest run`, which typechecks as it
 * goes, and a strict `tsc` over the project. With `--on Post` the contract and its test use the
 * type.
 *
 * The projects are written by `run()` to a real directory, and their `node_modules` link the
 * workspace's packages and tools, as an install would.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiIndex, emitDeclarations, parseApi, type ApiSource } from '@fudic/api';
import { beforeAll, describe, expect, it } from 'vitest';
import { nodeReadIo, nodeWriteIo } from '../src/io.js';
import { run } from '../src/run.js';
import { captureStreams, RecordingRunner } from './helpers.js';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const PACKAGES = ['core', 'dom', 'ssr', 'transport', 'testing', 'vite', 'http'];
const TOOLS = ['vitest', 'vite', 'typescript'];
const VITEST = join(REPO, 'node_modules/vitest/vitest.mjs');
const TSC = join(REPO, 'node_modules/typescript/bin/tsc');

async function cli(...argv: string[]): Promise<string> {
  const capture = captureStreams();
  const code = await run(argv, { readIo: nodeReadIo(), writeIo: nodeWriteIo(), runner: new RecordingRunner(), streams: capture.streams });
  if (code !== 0) throw new Error(`fudic ${argv.join(' ')} exited ${code}:\n${capture.stdout()}${capture.stderr()}`);
  return capture.stdout();
}

/** Link what an install would put in `node_modules`. */
function install(project: string): void {
  const modules = join(project, 'node_modules');
  mkdirSync(join(modules, '@fudic'), { recursive: true });
  for (const name of PACKAGES) symlinkSync(join(REPO, 'packages', name), join(modules, '@fudic', name), 'junction');
  for (const name of TOOLS) symlinkSync(join(REPO, 'node_modules', name), join(modules, name), 'junction');
}

/** The `.d.ts` of every `.fudapi` of the project, as `fudic dev` writes them to `.fudic/api`. */
function declarations(project: string, files: readonly string[], idOf: (file: string) => string): void {
  const sources: ApiSource[] = files.map((file) => ({
    id: idOf(file),
    path: join(project, file),
    file: parseApi(readFileSync(join(project, file), 'utf8')).value,
    origin: 'app',
  }));
  const index = createApiIndex(sources);
  for (const source of sources) {
    const out = join(project, '.fudic/api', `${source.id}.d.ts`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, emitDeclarations(source, index, {}));
  }
}

/** What a command prints, and its exit status: 0 for green. */
function exec(file: string, args: readonly string[], cwd: string): { status: number; output: string } {
  try {
    return { status: 0, output: execFileSync(process.execPath, [file, ...args], { cwd, encoding: 'utf8', stdio: 'pipe' }) };
  } catch (e) {
    const failed = e as { status?: number; stdout?: string; stderr?: string };
    return { status: failed.status ?? 1, output: `${failed.stdout ?? ''}${failed.stderr ?? ''}` };
  }
}

const ROOT = mkdtempSync(join(fileURLToPath(new URL('../node_modules/', import.meta.url)), '.fudic-pipe-green-'));

describe('criterion 14: fudic g pipe in a new app, green untouched', () => {
  const app = join(ROOT, 'tienda');
  beforeAll(async () => {
    await cli('new', 'tienda', '--no-install', '--no-git', '--cwd', ROOT);
    await cli('g', 'pipe', 'truncar', '--cwd', app);
    mkdirSync(join(app, 'src/types'), { recursive: true });
    writeFileSync(join(app, 'src/types/post.fudapi'), 'type Post\n  title  str\n');
    await cli('g', 'pipe', 'titulo', '--on', 'Post', '--cwd', app);
    install(app);
    declarations(app, ['src/pipes/truncar.fudapi', 'src/pipes/titulo.fudapi', 'src/types/post.fudapi'], (f) => f.replace(/^src\//u, '').replace(/\.fudapi$/u, ''));
  }, 120_000);

  it('writes the three files of §4.1, and --on uses the type', () => {
    expect(readFileSync(join(app, 'src/pipes/truncar.fudapi'), 'utf8')).toBe('pipe truncar\n  on str\n');
    expect(readFileSync(join(app, 'src/pipes/truncar.ts'), 'utf8')).toBe(
      "import { truncar } from 'fudic:pipes/truncar';\n\nexport default truncar.implement((value, locale) => value);\n",
    );
    expect(readFileSync(join(app, 'src/pipes/truncar.test.ts'), 'utf8')).toContain("expect(truncar.format('fudic', 'en')).toBe('fudic');");
    expect(readFileSync(join(app, 'src/pipes/titulo.fudapi'), 'utf8')).toBe('pipe titulo\n  on Post\n');
    expect(readFileSync(join(app, 'src/pipes/titulo.ts'), 'utf8')).toContain('String(value)');
  });

  it('its vitest run passes, the generated tests among them', () => {
    const { status, output } = exec(VITEST, ['run', '--reporter=verbose'], app);
    expect(output).toContain('truncar.test.ts');
    expect(output).toContain('titulo.test.ts');
    expect(status, output).toBe(0);
  }, 240_000);

  it('strict tsc says nothing', () => {
    const { status, output } = exec(TSC, ['-p', app, '--noEmit'], app);
    expect(output).toBe('');
    expect(status).toBe(0);
  }, 120_000);
});

describe('criterion 14: fudic g pipe in a new library, green untouched', () => {
  // A library lives in a workspace.
  const lib = join(ROOT, 'shop', 'libs', 'ui');
  beforeAll(async () => {
    await cli('new', 'shop', '--workspace', '--lib', 'ui', '--no-install', '--no-git', '--cwd', ROOT);
    await cli('g', 'pipe', 'iniciales', '--cwd', lib);
    install(lib);
    const pkg = (JSON.parse(readFileSync(join(lib, 'package.json'), 'utf8')) as { name: string }).name;
    declarations(lib, ['src/pipes/iniciales.fudapi'], () => `${pkg}/pipes/iniciales`);
  }, 120_000);

  it('imports its own pipe by the package name, and publishes the folder', () => {
    const pkg = JSON.parse(readFileSync(join(lib, 'package.json'), 'utf8')) as { name: string; exports: Record<string, string> };
    expect(readFileSync(join(lib, 'src/pipes/iniciales.ts'), 'utf8')).toContain(`from 'fudic:${pkg.name}/pipes/iniciales'`);
    expect(pkg.exports['./pipes/*']).toBe('./src/pipes/*.ts');
  });

  it('its vitest run passes, and strict tsc says nothing', () => {
    const tests = exec(VITEST, ['run', '--reporter=verbose'], lib);
    expect(tests.output).toContain('iniciales.test.ts');
    expect(tests.status, tests.output).toBe(0);
    const types = exec(TSC, ['-p', lib, '--noEmit'], lib);
    expect(types.output).toBe('');
  }, 240_000);
});
