/**
 * SDD-71 §3.6 and §4.1: the plan of `fudic g pipe`, in memory. That what it writes is green
 * untouched, run for real, is `pipe-green.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import { planPipe } from '../src/plans/pipe.js';
import { contentsOf, MemoryFs, projectFs } from './helpers.js';
import type { PipeOptions } from '../src/types.js';

const options = (overrides: Partial<PipeOptions> = {}): PipeOptions => ({ cwd: '/project', force: false, on: 'str', ...overrides });
const created = (plan: Awaited<ReturnType<typeof planPipe>>): Record<string, string> =>
  Object.fromEntries(plan.changes.filter((c) => c.kind === 'create').map((c) => [c.path, contentsOf(c)]));

describe('fudic g pipe in an app', () => {
  it('writes the contract, the implementation and its test in src/pipes, and adds @fudic/core', async () => {
    const fs = projectFs({ 'package.json': JSON.stringify({ name: 'tienda' }) });
    const plan = await planPipe('nombre-corto', options(), fs);
    expect(plan.errors).toEqual([]);
    const files = created(plan);
    expect(files['src/pipes/nombre-corto.fudapi']).toBe('pipe nombre-corto\n  on str\n');
    expect(files['src/pipes/nombre-corto.ts']).toBe(
      "import { nombreCorto } from 'fudic:pipes/nombre-corto';\n\nexport default nombreCorto.implement((value, locale) => value);\n",
    );
    expect(files['src/pipes/nombre-corto.test.ts']).toBe(
      "import { expect, test } from 'vitest';\nimport nombreCorto from './nombre-corto';\n\ntest('nombre-corto formats a value', () => {\n  expect(nombreCorto.format('fudic', 'en')).toBe('fudic');\n});\n",
    );
    const manifest = plan.changes.find((c) => c.path === 'package.json');
    expect(manifest?.kind).toBe('modify');
    expect(plan.commands).toEqual([{ command: 'pnpm', args: ['install'], dir: '.', quiet: true }]);
    expect((plan.report ?? []).join('\n')).toContain('Created pipe nombreCorto in src/pipes/');
    expect((plan.report ?? []).join('\n')).toContain('Added @fudic/core');
  });

  it('--on another type writes the value as text, and the test asks for text', async () => {
    const fs = projectFs({ 'package.json': JSON.stringify({ name: 'tienda', dependencies: { '@fudic/core': '0.0.1' } }) });
    const plan = await planPipe('titulo', options({ on: 'Post' }), fs);
    const files = created(plan);
    expect(files['src/pipes/titulo.fudapi']).toBe('pipe titulo\n  on Post\n');
    expect(files['src/pipes/titulo.ts']).toContain('titulo.implement((value, locale) => String(value));');
    expect(files['src/pipes/titulo.test.ts']).toContain("const value = {} as Parameters<typeof titulo.format>[0];\n  expect(typeof titulo.format(value, 'en')).toBe('string');");
  });

  it('with @fudic/core already there adds nothing and installs nothing', async () => {
    const fs = projectFs({ 'package.json': JSON.stringify({ name: 'tienda', dependencies: { '@fudic/core': '0.0.1' } }) });
    const plan = await planPipe('truncar', options(), fs);
    expect(plan.changes.map((c) => c.path)).toEqual(['src/pipes/truncar.fudapi', 'src/pipes/truncar.ts', 'src/pipes/truncar.test.ts']);
    expect(plan.commands).toEqual([]);
    expect((plan.report ?? []).join('\n')).not.toContain('Added');
  });

  it('goes to the folder fudic.json names', async () => {
    const fs = projectFs({ 'package.json': JSON.stringify({ name: 'tienda', dependencies: { '@fudic/core': '0.0.1' } }) }, '/project', {
      id: 'tienda',
      kind: 'app',
      pipes: 'src/format',
    });
    const files = created(await planPipe('truncar', options(), fs));
    expect(Object.keys(files)).toEqual(['src/format/truncar.fudapi', 'src/format/truncar.ts', 'src/format/truncar.test.ts']);
    expect(files['src/format/truncar.ts']).toContain("from 'fudic:format/truncar'");
  });
});

describe('fudic g pipe in a library', () => {
  it('imports its own pipe by the package name (SDD-71 §4.5)', async () => {
    const fs = projectFs({ 'package.json': JSON.stringify({ name: '@acme/ui', peerDependencies: { '@fudic/core': '0.0.1' } }) }, '/project', {
      id: 'ui',
      kind: 'lib',
    });
    const files = created(await planPipe('iniciales', options(), fs));
    expect(files['src/pipes/iniciales.ts']).toContain("import { iniciales } from 'fudic:@acme/ui/pipes/iniciales';");
  });
});

describe('what fudic g pipe refuses', () => {
  it.each(['Truncar', 'truncar_texto', '1truncar', 'truncar-', 'a--b'])('a name that is no kebab-case word: %s', async (name) => {
    const plan = await planPipe(name, options(), projectFs());
    expect(plan.errors.map((e) => e.code)).toEqual(['FUD0457']);
    expect(plan.changes).toEqual([]);
  });

  it('outside a project, FUD0781', async () => {
    const plan = await planPipe('truncar', options(), new MemoryFs({}, '/project'));
    expect(plan.errors.map((e) => e.code)).toEqual(['FUD0781']);
  });

  it('a file that is already there, without --force; with it, it is replaced', async () => {
    const fs = projectFs({
      'package.json': JSON.stringify({ name: 'tienda', dependencies: { '@fudic/core': '0.0.1' } }),
      'src/pipes/truncar.ts': 'export default 1;\n',
    });
    const refused = await planPipe('truncar', options(), fs);
    expect(refused.errors.length).toBe(1);
    expect(refused.changes.map((c) => c.path)).toEqual(['src/pipes/truncar.fudapi', 'src/pipes/truncar.test.ts']);
    const forced = await planPipe('truncar', options({ force: true }), fs);
    expect(forced.errors).toEqual([]);
    expect(forced.changes.map((c) => c.path)).toContain('src/pipes/truncar.ts');
  });
});
