/**
 * SDD-66 §3.3 — criteria 13 and 14: a new library exports its fixtures, and `g spec` writes the
 * fixture in the one form `g component` writes it.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderTemplate } from '../src/templates.js';
import { planSpec } from '../src/plans/spec.js';
import { run } from '../src/run.js';
import { captureStreams, MemoryFs, projectFs, RecordingRunner } from './helpers.js';

async function cli(fs: MemoryFs, ...argv: string[]): Promise<number> {
  const capture = captureStreams();
  return run(argv, { readIo: fs, writeIo: fs, runner: new RecordingRunner(), streams: capture.streams });
}

type Exports = Readonly<Record<string, string>>;

/** The target `specifier` names through `exports`, as Node matches a `*` pattern. */
function target(exports: Exports, specifier: string): string | undefined {
  for (const [key, value] of Object.entries(exports)) {
    const [before, after] = key.split('*') as [string, string | undefined];
    if (after === undefined) {
      if (key === specifier) return value;
      continue;
    }
    if (specifier.startsWith(before) && specifier.endsWith(after) && specifier.length >= before.length + after.length) {
      return value.replaceAll('*', specifier.slice(before.length, specifier.length - after.length));
    }
  }
  return undefined;
}

describe('criterion 13: a library exports its fixtures', () => {
  it('a new library, from `g lib`, exports ./*.fixture as the fixture beside each component', async () => {
    const fs = new MemoryFs({}, '/w');
    expect(await cli(fs, 'new', 'acme', '--workspace', '--cwd', '/w')).toBe(0);
    expect(await cli(fs, 'g', 'lib', 'ui', '--cwd', '/w/acme')).toBe(0);
    const pkg = JSON.parse(fs.at('acme/libs/ui/package.json')) as { exports: Exports };
    expect(pkg.exports['./*.fixture']).toBe('./src/components/*/*.fixture.ts');
    expect(target(pkg.exports, './acme-button.fixture')).toBe('./src/components/acme-button/acme-button.fixture.ts');
    // The component and its fixture are named the same way: the showcase imports one beside the other.
    expect(target(pkg.exports, './acme-button.fud')).toBe('./src/components/acme-button/acme-button.fud');
  });

  it('the template says so, and so does the library of examples/workspace', () => {
    expect(renderTemplate('lib/package.json.tmpl', { name: '@acme/ui', version: '0.0.1', viteVersion: '8', vitestVersion: '4', uses: '' })).toContain(
      '"./*.fixture": "./src/components/*/*.fixture.ts"',
    );
    const example = JSON.parse(readFileSync(fileURLToPath(new URL('../../../examples/workspace/libs/ui/package.json', import.meta.url)), 'utf8')) as {
      exports: Exports;
    };
    expect(example.exports['./*.fixture']).toBe('./src/components/*/*.fixture.ts');
  });
});

describe('criterion 14: g spec writes the fixture as g component does', () => {
  const COMPONENT = `@code {
  const p = props<{ title: string; count: number }>();
}

<app-card>
  <template shadowrootmode="open">
    <span><slot></slot></span>
  </template>
</app-card>
`;

  it('with required props: Fixtures<$Props> and its import, the same head as g component', async () => {
    const fs = projectFs({ 'src/components/app-card/app-card.fud': COMPONENT }, '/project', { id: 'demo', kind: 'app', prefix: 'app' });
    const props = () =>
      Promise.resolve([
        { name: 'title', required: true, shape: { kind: 'string' as const } },
        { name: 'count', required: true, shape: { kind: 'number' as const } },
      ]);
    const plan = await planSpec('app-card', { cwd: '/project', force: false }, fs, props);
    expect(plan.errors).toEqual([]);
    const fixture = plan.changes.find((change) => change.path.endsWith('.fixture.ts'))!.contents;
    expect(fixture.startsWith("import type { Fixtures } from '@fudic/terms';\nimport type { $Props } from './app-card.fud';\n\n")).toBe(true);
    expect(fixture.trimEnd().endsWith('} satisfies Fixtures<$Props>;')).toBe(true);
    expect(fixture).not.toContain('Record<');

    const scaffolded = renderTemplate('component/fixture.ts.tmpl', { tag: 'app-card' });
    expect(fixture.split('\n').slice(0, 3)).toEqual(scaffolded.split('\n').slice(0, 3));
  });
});
