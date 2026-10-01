/**
 * SDD-43 §4.6 and SDD-46 §4.2 — which style guides a component adopts, and which it may
 * choose, worked out by the host.
 *
 * The chain is a fact of `package.json` files on a disk, so the plugin is the one that can
 * answer it: for the package that DEFINES a component, its dependencies' sheets come first and
 * its own last, and the consumer's sheet never enters. That last clause is the point — an app
 * that could restyle a library's components by dropping a file in its own project would be a
 * library nobody can upgrade. What a component may choose follows the same chain.
 */

import { describe, expect, it } from 'vitest';
import type { PackageFs } from '@fudic/resolve';
import { ProjectStyleChains } from '../src/styles.js';

const APP = '/ws/apps/tienda';

const manifest = (name: string, deps: Readonly<Record<string, string>> = {}): string =>
  JSON.stringify({ name, dependencies: deps });

/** A `PackageFs` over a flat map: no disk, and a path is its own real name. */
const fs = (files: Readonly<Record<string, string>>): PackageFs => ({
  readFile: (path) => files[path],
  realPath: (path) => path,
});

const config = (fields: Record<string, unknown>): string => JSON.stringify(fields);

/** guia ← ui ← tienda, each with a global sheet; ui and tienda also offer one to choose. */
const WORKSPACE: Readonly<Record<string, string>> = {
  [`${APP}/package.json`]: manifest('@acme/tienda', { '@acme/ui': 'workspace:*' }),
  [`${APP}/fudic.json`]: config({
    kind: 'app',
    id: 'tienda',
    globalStyles: { tienda: 'tienda.css' },
    styles: { panel: 'panel.css' },
  }),
  [`${APP}/tienda.css`]: ':host { margin: 0; }',
  [`${APP}/panel.css`]: '.panel { padding: 1rem; }',
  [`${APP}/node_modules/@acme/ui/package.json`]: manifest('@acme/ui', { '@acme/guia': '*' }),
  [`${APP}/node_modules/@acme/ui/fudic.json`]: config({
    kind: 'lib',
    globalStyles: { ui: 'ui.css' },
    styles: { cards: 'cards.css' },
  }),
  [`${APP}/node_modules/@acme/ui/ui.css`]: ':host { display: block; }',
  [`${APP}/node_modules/@acme/ui/cards.css`]: '.card { border: 1px solid; }',
  [`${APP}/node_modules/@acme/ui/src/ui-card.fud`]: 'x',
  [`${APP}/node_modules/@acme/guia/package.json`]: manifest('@acme/guia'),
  [`${APP}/node_modules/@acme/guia/fudic.json`]: config({ kind: 'lib', globalStyles: { tokens: 'tokens.css' } }),
  [`${APP}/node_modules/@acme/guia/tokens.css`]: ':host { --accent: red; }',
};

const specifiers = (chains: ProjectStyleChains, file: string): readonly string[] =>
  chains.chainFor(file).map((sheet) => sheet.specifier);

const choosable = (chains: ProjectStyleChains, file: string): readonly string[] => [
  ...chains.choosableFor(file).keys(),
];

describe('ProjectStyleChains — the global sheets', () => {
  it('gives a component of the app the whole chain, its own project last', () => {
    const chains = new ProjectStyleChains(APP, fs(WORKSPACE));
    expect(specifiers(chains, `${APP}/src/components/app-panel.fud`)).toEqual(['tokens', 'ui', 'tienda']);
  });

  it('gives a component of the library ITS chain, and not the consumer’s sheet', () => {
    const chains = new ProjectStyleChains(APP, fs(WORKSPACE));
    expect(specifiers(chains, `${APP}/node_modules/@acme/ui/src/ui-card.fud`)).toEqual(['tokens', 'ui']);
  });

  it('treats a file above every package.json as the project being built', () => {
    // A root with a `fudic.json` and no `package.json` of its own is every test root and
    // plenty of real apps. Nothing above the root describes this project's chain.
    const chains = new ProjectStyleChains('/p', fs({
      '/package.json': manifest('the-monorepo'),
      '/p/fudic.json': config({ kind: 'app', id: 'p', globalStyles: { theme: 'theme.css' } }),
      '/p/theme.css': ':host { --gap: 8px; }',
    }));
    expect(specifiers(chains, '/p/src/routes/index.fud')).toEqual(['theme']);
  });

  it('answers the same list for every file when there are no libraries at all', () => {
    const chains = new ProjectStyleChains('/p', fs({
      '/p/package.json': manifest('@acme/p'),
      '/p/fudic.json': config({ kind: 'app', id: 'p', globalStyles: { theme: 'theme.css' } }),
      '/p/theme.css': ':host { --gap: 8px; }',
    }));
    expect(specifiers(chains, '/p/a.fud')).toEqual(['theme']);
    expect(specifiers(chains, '/p/deep/b.fud')).toEqual(['theme']);
  });

  it('is empty for a project that declares no styles', () => {
    const chains = new ProjectStyleChains('/p', fs({ '/p/fudic.json': config({ kind: 'app', id: 'p' }) }));
    expect(chains.chainFor('/p/a.fud')).toEqual([]);
    expect(chains.choosableFor('/p/a.fud').size).toBe(0);
    expect(chains.own('/p').global).toEqual([]);
    expect(chains.own('/p').optional).toEqual([]);
  });

  it('reports two packages whose sheets share a name, and keeps the first', () => {
    // `tokens` from two packages cannot be told apart in the module map, and one would
    // silently replace the other — the same FUD0741 as a name in both maps of one project.
    const chains = new ProjectStyleChains(APP, fs({
      ...WORKSPACE,
      [`${APP}/fudic.json`]: config({ kind: 'app', id: 'tienda', globalStyles: { tokens: 'tokens.css' } }),
      [`${APP}/tokens.css`]: ':host { --accent: blue; }',
    }));
    expect(specifiers(chains, `${APP}/src/a.fud`)).toEqual(['tokens', 'ui']);
    const clash = chains.diagnostics.find((d) => d.code === 'FUD0741');
    expect(clash?.message).toContain('@acme/guia');
    expect(clash?.message).toContain('@acme/tienda');
  });

  it('names a nameless package by its directory, in the chain and in a clash', () => {
    // A private library need not have a `name`, and a diagnostic still has to name something
    // the author can go and look at.
    const chains = new ProjectStyleChains(APP, fs({
      ...WORKSPACE,
      [`${APP}/node_modules/@acme/guia/package.json`]: JSON.stringify({ version: '1.0.0' }),
      [`${APP}/fudic.json`]: config({ kind: 'app', id: 'tienda', globalStyles: { tokens: 'tokens.css' } }),
      [`${APP}/tokens.css`]: ':host { --accent: blue; }',
    }));
    expect(specifiers(chains, `${APP}/src/a.fud`)).toEqual(['tokens', 'ui']);
    expect(chains.diagnostics[0]?.message).toContain(`${APP}/node_modules/@acme/guia`);
  });

  it('collects a LIBRARY’s own reading errors, and leaves this project’s to the plugin', () => {
    // A sheet a library declares and does not ship breaks this build, so it is reported —
    // naming the package, because that is who has to fix it. The project's own errors travel
    // through `own(root)`, which is where the plugin already reads them.
    const chains = new ProjectStyleChains(APP, fs({
      ...WORKSPACE,
      [`${APP}/fudic.json`]: config({ kind: 'app', id: 'tienda', globalStyles: { missing: 'missing.css' } }),
      [`${APP}/node_modules/@acme/ui/fudic.json`]: config({ kind: 'lib', globalStyles: { gone: 'gone.css' } }),
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
    for (const file of ['a.fud', 'b.fud', 'c.fud']) {
      specifiers(chains, `${APP}/src/${file}`);
      choosable(chains, `${APP}/src/${file}`);
    }
    // Once for «is it there» and once for its text, and that is all: three files asking is
    // not three reads of one sheet, which is what a build of hundreds of files turns on.
    expect(reads.filter((path) => path === `${APP}/tienda.css`)).toHaveLength(2);
  });
});

describe('ProjectStyleChains — what a component may choose (SDD-46 §4.2)', () => {
  it('offers an app component the `styles` of every package of its chain', () => {
    const chains = new ProjectStyleChains(APP, fs(WORKSPACE));
    expect(choosable(chains, `${APP}/src/components/app-panel.fud`)).toEqual(['cards', 'panel']);
    expect(chains.choosableFor(`${APP}/src/a.fud`).get('panel')).toEqual({
      specifier: 'panel',
      css: '.panel { padding: 1rem; }',
    });
  });

  it('offers a library component its own chain, never the consumer’s `styles`', () => {
    const chains = new ProjectStyleChains(APP, fs(WORKSPACE));
    expect(choosable(chains, `${APP}/node_modules/@acme/ui/src/ui-card.fud`)).toEqual(['cards']);
  });

  it('keeps no global sheet among the choosable ones', () => {
    const chains = new ProjectStyleChains(APP, fs(WORKSPACE));
    expect(choosable(chains, `${APP}/src/a.fud`)).not.toContain('tienda');
  });

  it('reports a `styles` name another package of the chain already uses as global', () => {
    const chains = new ProjectStyleChains(APP, fs({
      ...WORKSPACE,
      [`${APP}/fudic.json`]: config({ kind: 'app', id: 'tienda', styles: { ui: 'mine.css' } }),
      [`${APP}/mine.css`]: '.mine{}',
    }));
    expect(choosable(chains, `${APP}/src/a.fud`)).toEqual(['cards']);
    expect(chains.diagnostics.map((d) => d.code)).toEqual(['FUD0741']);
  });
});
