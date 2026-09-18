/**
 * SDD-43 §4.6 — which style guides a component adopts, worked out by the host.
 *
 * The chain is a fact of `package.json` files on a disk, so the plugin is the one that can
 * answer it: for the package that DEFINES a component, its dependencies' sheets come first and
 * its own last, and the consumer's sheet never enters. That last clause is the point — an app
 * that could restyle a library's components by dropping a file in its own project would be a
 * library nobody can upgrade.
 */

import { describe, expect, it } from 'vitest';
import { FUD_STYLE_SPECIFIER_CLASH } from '@fudic/config';
import type { PackageFs } from '@fudic/resolve';
import { ProjectStyleChains } from '../src/styles.js';

const APP = '/ws/apps/tienda';
const UI = '/ws/libs/ui';
const GUIA = '/ws/libs/guia';

const manifest = (name: string, deps: Readonly<Record<string, string>> = {}): string =>
  JSON.stringify({ name, dependencies: deps });

/** A `PackageFs` over a flat map: no disk, and a path is its own real name. */
const fs = (files: Readonly<Record<string, string>>): PackageFs => ({
  readFile: (path) => files[path],
  realPath: (path) => path,
});

/** guia ← ui ← tienda, each with a sheet of its own, installed as a workspace would. */
const WORKSPACE: Readonly<Record<string, string>> = {
  [`${APP}/package.json`]: manifest('@acme/tienda', { '@acme/ui': 'workspace:*' }),
  [`${APP}/fudic.json`]: JSON.stringify({ kind: 'app', id: 'tienda', styles: ['tienda.css'] }),
  [`${APP}/tienda.css`]: ':host { margin: 0; }',
  [`${APP}/node_modules/@acme/ui/package.json`]: manifest('@acme/ui', { '@acme/guia': '*' }),
  [`${APP}/node_modules/@acme/ui/fudic.json`]: JSON.stringify({ kind: 'lib', styles: ['ui.css'] }),
  [`${APP}/node_modules/@acme/ui/ui.css`]: ':host { display: block; }',
  [`${APP}/node_modules/@acme/ui/src/ui-card.fud`]: 'x',
  [`${APP}/node_modules/@acme/guia/package.json`]: manifest('@acme/guia'),
  [`${APP}/node_modules/@acme/guia/fudic.json`]: JSON.stringify({ kind: 'lib', styles: ['tokens.css'] }),
  [`${APP}/node_modules/@acme/guia/tokens.css`]: ':host { --accent: red; }',
};

const specifiers = (chains: ProjectStyleChains, file: string): readonly string[] =>
  chains.chainFor(file).map((sheet) => sheet.specifier);

describe('ProjectStyleChains', () => {
  it('gives a component of the app the whole chain, its own project last', () => {
    const chains = new ProjectStyleChains(APP, fs(WORKSPACE));
    expect(specifiers(chains, `${APP}/src/components/app-panel.fud`)).toEqual([
      '_tokens',
      '_ui',
      '_tienda',
    ]);
  });

  it('gives a component of the library ITS chain, and not the consumer’s sheet', () => {
    const chains = new ProjectStyleChains(APP, fs(WORKSPACE));
    expect(specifiers(chains, `${APP}/node_modules/@acme/ui/src/ui-card.fud`)).toEqual([
      '_tokens',
      '_ui',
    ]);
  });

  it('treats a file above every package.json as the project being built', () => {
    // A root with a `fudic.json` and no `package.json` of its own is every test root and
    // plenty of real apps. Nothing above the root describes this project's chain.
    const chains = new ProjectStyleChains('/p', fs({
      '/package.json': manifest('the-monorepo'),
      '/p/fudic.json': JSON.stringify({ kind: 'app', id: 'p', styles: ['theme.css'] }),
      '/p/theme.css': ':host { --gap: 8px; }',
    }));
    expect(specifiers(chains, '/p/src/routes/index.fud')).toEqual(['_theme']);
  });

  it('answers the same list for every file when there are no libraries at all', () => {
    const chains = new ProjectStyleChains('/p', fs({
      '/p/package.json': manifest('@acme/p'),
      '/p/fudic.json': JSON.stringify({ kind: 'app', id: 'p', styles: ['theme.css'] }),
      '/p/theme.css': ':host { --gap: 8px; }',
    }));
    expect(specifiers(chains, '/p/a.fud')).toEqual(['_theme']);
    expect(specifiers(chains, '/p/deep/b.fud')).toEqual(['_theme']);
  });

  it('is empty for a project that declares no styles', () => {
    const chains = new ProjectStyleChains('/p', fs({ '/p/fudic.json': JSON.stringify({ kind: 'app', id: 'p' }) }));
    expect(chains.chainFor('/p/a.fud')).toEqual([]);
    expect(chains.own('/p').styles).toEqual([]);
  });

  it('reports two packages whose sheets adopt under one specifier, and keeps the first', () => {
    // `_tokens` from two packages cannot be told apart in the module map, and one would
    // silently replace the other — the same FUD0741 as two entries inside one project.
    const chains = new ProjectStyleChains(APP, fs({
      ...WORKSPACE,
      [`${APP}/fudic.json`]: JSON.stringify({ kind: 'app', id: 'tienda', styles: ['tokens.css'] }),
      [`${APP}/tokens.css`]: ':host { --accent: blue; }',
    }));
    expect(specifiers(chains, `${APP}/src/a.fud`)).toEqual(['_tokens', '_ui']);
    const clash = chains.diagnostics.find((d) => d.code === FUD_STYLE_SPECIFIER_CLASH);
    expect(clash?.message).toContain('@acme/guia');
    expect(clash?.message).toContain('@acme/tienda');
  });

  it('names a nameless package by its directory, in the chain and in a clash', () => {
    // A private library need not have a `name`, and a diagnostic still has to name something
    // the author can go and look at.
    const chains = new ProjectStyleChains(APP, fs({
      ...WORKSPACE,
      [`${APP}/node_modules/@acme/guia/package.json`]: JSON.stringify({ version: '1.0.0' }),
      [`${APP}/fudic.json`]: JSON.stringify({ kind: 'app', id: 'tienda', styles: ['tokens.css'] }),
      [`${APP}/tokens.css`]: ':host { --accent: blue; }',
    }));
    expect(specifiers(chains, `${APP}/src/a.fud`)).toEqual(['_tokens', '_ui']);
    expect(chains.diagnostics[0]?.message).toContain(`${APP}/node_modules/@acme/guia`);
  });

  it('collects a LIBRARY’s own reading errors, and leaves this project’s to the plugin', () => {
    // A sheet a library declares and does not ship breaks this build, so it is reported —
    // naming the package, because that is who has to fix it. The project's own errors travel
    // through `own(root)`, which is where the plugin already reads them.
    const chains = new ProjectStyleChains(APP, fs({
      ...WORKSPACE,
      [`${APP}/fudic.json`]: JSON.stringify({ kind: 'app', id: 'tienda', styles: ['missing.css'] }),
      [`${APP}/node_modules/@acme/ui/fudic.json`]: JSON.stringify({ kind: 'lib', styles: ['gone.css'] }),
    }));
    chains.chainOfPackage(APP);
    expect(chains.diagnostics).toHaveLength(1);
    expect(chains.diagnostics[0]?.message).toContain('gone.css');
    expect(chains.own(APP).errors[0]?.message).toContain('missing.css');
  });

  it('reads each package once, however many files ask', () => {
    const reads: string[] = [];
    const io: PackageFs = {
      readFile: (path) => {
        reads.push(path);
        return WORKSPACE[path];
      },
      realPath: (path) => path,
    };
    const chains = new ProjectStyleChains(APP, io);
    for (const file of ['a.fud', 'b.fud', 'c.fud']) specifiers(chains, `${APP}/src/${file}`);
    // Once for «is it there» and once for its text, and that is all: three files asking is
    // not three reads of one sheet, which is what a build of hundreds of files turns on.
    expect(reads.filter((path) => path === `${APP}/tienda.css`)).toHaveLength(2);
  });
});
