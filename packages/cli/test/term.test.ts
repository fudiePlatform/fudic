/**
 * `fudic g term <block> <name>` (SDD-53 §4.2) — criterion 11.
 */

import { describe, expect, it } from 'vitest';
import { createTermCatalog, parseSpec, termModule, validateSpec, type SpecFs } from '@fudic/spec';
import { parseArgs } from '../src/args.js';
import { planTerm } from '../src/plans/term.js';
import { run } from '../src/run.js';
import { captureStreams, MemoryFs, projectFs, RecordingRunner } from './helpers.js';
import type { TermOptions } from '../src/types.js';

const CWD = '/project';

const options = (over: Partial<TermOptions> = {}): TermOptions => ({
  cwd: CWD,
  force: false,
  block: 'then',
  params: [],
  ...over,
});

const codes = (plan: { readonly errors: readonly { readonly code: string }[] }) => plan.errors.map((e) => e.code);

describe('parseArgs g term', () => {
  it('reads the block, the name and every --param in order', () => {
    expect(parseArgs(['g', 'term', 'then', 'tiene-sombra', '--param', 'target:element', '--param', 'px:number'])).toMatchObject({
      kind: 'term',
      name: 'tiene-sombra',
      opts: { block: 'then', params: ['target:element', 'px:number'] },
    });
  });

  it('takes the alias, --project, and no --param at all', () => {
    expect(parseArgs(['g', 't', 'given', 'logged-in', '--project', 'ui'])).toMatchObject({
      kind: 'term',
      name: 'logged-in',
      opts: { block: 'given', params: [], project: 'ui' },
    });
  });

  it('is FUD0448 without a name, and with a flag it does not take', () => {
    const missing = parseArgs(['g', 'term', 'then']);
    expect(missing.kind === 'error' && missing.error.code).toBe('FUD0448');
    expect(parseArgs(['g', 'term', 'then', 'x', '--spec']).kind).toBe('error');
  });
});

describe('g term (criterion 11)', () => {
  it('writes a module the validator reads clean and a .fudspec can use', async () => {
    const plan = await planTerm('tiene-sombra', options({ params: ['target:element', 'px:number'] }), projectFs({}, CWD));
    const params = [
      { name: 'target', type: 'element' },
      { name: 'px', type: 'number' },
    ] as const;

    expect(plan.errors).toEqual([]);
    expect(plan.changes).toEqual([
      { kind: 'create', path: 'fudic/terms/then/tiene-sombra.js', contents: termModule('then', 'tiene-sombra', params) },
    ]);

    const root = '/project/fudic/terms';
    const files: Readonly<Record<string, string>> = { [`${root}/then/tiene-sombra.js`]: plan.changes[0]!.contents };
    const fs: SpecFs = {
      readDirectory: (path) => (path === `${root}/then` ? ['tiene-sombra.js'] : []),
      readFile: (path) => files[path],
    };
    const terms = createTermCatalog([{ layer: 'workspace', path: root }], fs);
    const spec = 'component app-card\n\ncriterion sombra\n  then\n    tiene-sombra app-card 4\n';
    const parsed = parseSpec(spec);
    expect(parsed.diagnostics).toEqual([]);
    const component = { tag: 'app-card', path: '/project/app-card.fud', requiredProps: [] };
    expect(validateSpec(parsed.value, { terms, component: () => component, fixtures: () => undefined })).toEqual([]);
  });

  it('writes into the project named by --project', async () => {
    const fs = new MemoryFs(
      {
        'pnpm-workspace.yaml': "packages:\n  - 'libs/*'\n",
        'package.json': '{"name":"shop","private":true}',
        'libs/ui/fudic.json': '{"kind":"lib","prefix":"ui"}',
        'libs/ui/package.json': '{"name":"@shop/ui"}',
      },
      '/ws',
    );
    const plan = await planTerm('visible', options({ cwd: '/ws', project: 'ui', block: 'given' }), fs);
    expect(plan.changes.map((change) => change.path)).toEqual(['libs/ui/fudic/terms/given/visible.js']);
  });
});

describe('g term errors (criterion 11)', () => {
  const fs = projectFs({ 'fudic/terms/then/taken.js': 'export const meta = {};\n' }, CWD);

  it('FUD0448 for a block that is not given, when or then', async () => {
    expect(codes(await planTerm('x', options({ block: 'thn' }), fs))).toEqual(['FUD0448']);
  });

  it('FUD0961 for a name that is not kebab-case', async () => {
    for (const name of ['BadName', 'bad_name', '1bad', 'bad-', 'bad--name', '-bad']) {
      expect(codes(await planTerm(name, options(), fs))).toEqual(['FUD0961']);
    }
  });

  it('FUD0962 for a --param without a type, with a bad name or with a type out of the list', async () => {
    for (const param of ['a:color', 'nocolon', '1a:string', 'a:', ':string']) {
      expect(codes(await planTerm('x', options({ params: [param] }), fs))).toEqual(['FUD0962']);
    }
  });

  it('FUD0963 for two --param with the same name', async () => {
    expect(codes(await planTerm('x', options({ params: ['a:string', 'b:token', 'a:number'] }), fs))).toEqual(['FUD0963']);
  });

  it('FUD0443 for a term that exists, replaced with --force', async () => {
    expect(codes(await planTerm('taken', options(), fs))).toEqual(['FUD0443']);
    const forced = await planTerm('taken', options({ force: true }), fs);
    expect(forced.errors).toEqual([]);
    expect(forced.changes.map((change) => `${change.kind} ${change.path}`)).toEqual(['modify fudic/terms/then/taken.js']);
  });

  it('FUD0781 outside a project', async () => {
    expect(codes(await planTerm('x', options(), new MemoryFs({}, CWD)))).toEqual(['FUD0781']);
  });
});

describe('g term through the binary', () => {
  const deps = (fs: MemoryFs) => {
    const capture = captureStreams();
    return { capture, deps: { readIo: fs, writeIo: fs, runner: new RecordingRunner(), streams: capture.streams } };
  };

  it('writes the module', async () => {
    const fs = projectFs({}, CWD);
    const { deps: d, capture } = deps(fs);
    expect(await run(['g', 'term', 'when', 'pulsa', '--param', 'target:element', '--cwd', CWD], d)).toBe(0);
    expect(fs.at('fudic/terms/when/pulsa.js')).toBe(termModule('when', 'pulsa', [{ name: 'target', type: 'element' }]));
    expect(capture.stdout()).toContain('create  fudic/terms/when/pulsa.js');
  });

  it('--dry-run --json shows it and writes nothing', async () => {
    const fs = projectFs({}, CWD);
    const { deps: d, capture } = deps(fs);
    expect(await run(['g', 't', 'then', 'x', '--cwd', CWD, '--dry-run', '--json'], d)).toBe(0);
    const plan = JSON.parse(capture.stdout()) as { changes: { path: string }[] };
    expect(plan.changes.map((change) => change.path)).toEqual(['fudic/terms/then/x.js']);
    expect(fs.paths()).toEqual(['fudic.json']);
  });

  it('a bad name exits 1, writing nothing', async () => {
    const fs = projectFs({}, CWD);
    const { deps: d, capture } = deps(fs);
    expect(await run(['g', 'term', 'then', 'BadName', '--cwd', CWD], d)).toBe(1);
    expect(capture.stdout()).toContain('FUD0961');
    expect(fs.paths()).toEqual(['fudic.json']);
  });
});
