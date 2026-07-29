/**
 * The package scaffolding itself (SDD-24 tasks 1–4): the manifest, the fixture workspace
 * and the entry point are load-bearing, so they get a test from the first commit — the
 * package is born at 100% coverage, and a file no test imports must show as 0%.
 */

import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { VERSION } from '../src/index.js';

const at = (relative: string): string => fileURLToPath(new URL(`../${relative}`, import.meta.url));
const json = (relative: string): Record<string, unknown> =>
  JSON.parse(readFileSync(at(relative), 'utf8')) as Record<string, unknown>;

describe('package', () => {
  it('exposes its version', () => {
    expect(VERSION).toBe('0.0.1');
  });

  it('pins every dependency exactly, workspace links aside', () => {
    const manifest = json('package.json');
    const deps = {
      ...(manifest['dependencies'] as Record<string, string>),
      ...(manifest['devDependencies'] as Record<string, string>),
    };

    for (const [name, range] of Object.entries(deps)) {
      if (range.startsWith('workspace:')) continue;
      expect(range, name).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it('keeps the Volar packages on one version', () => {
    const deps = json('package.json')['dependencies'] as Record<string, string>;
    const volar = Object.entries(deps).filter(([name]) => name.startsWith('@volar/'));

    expect(volar.length).toBe(4);
    expect(new Set(volar.map(([, range]) => range)).size).toBe(1);
  });
});

describe('fixture workspace', () => {
  const files = [
    'fixtures/tsconfig.json',
    'fixtures/blog/[slug].fud',
    'fixtures/layouts/_layout.fud',
    'fixtures/components/site-nav.fud',
    'fixtures/components/app-badge.fud',
    'fixtures/data/posts.ts',
  ];

  it.each(files)('ships %s', (relative) => {
    expect(existsSync(at(relative))).toBe(true);
  });

  it('typechecks .fud files and does not ship the ambient globals', () => {
    // A project that never ran `fudic new` is the interesting case: the server mounts
    // GLOBALS_DTS as a virtual lib (§2), so the file must be ABSENT here.
    expect(existsSync(at('fixtures/fudic-globals.d.ts'))).toBe(false);
    expect(json('fixtures/tsconfig.json')['include']).toContain('**/*.fud');
  });
});
