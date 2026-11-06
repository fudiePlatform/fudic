/**
 * SDD-79 §4.2, §4.3, §4.7 — the style guide as the build reads it (`src/guide.ts`, and the
 * guides in `ProjectStyleChains`): which pieces a component may adopt, what is wrong with a
 * guide, the guides each entry links and the icon it gets. Criteria 12, 13 and 17 at the host's
 * level; the build of a real workspace is `build-guide.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import type { PackageFs } from '@fudic/resolve';
import { entryGuide, readPackageGuide, specFrom } from '../src/guide.js';
import { ProjectStyleChains } from '../src/styles.js';

const APP = '/ws/apps/tienda';
const GUIDE = `${APP}/node_modules/@acme/guide`;

const fs = (files: Readonly<Record<string, string>>): PackageFs => ({
  // As node spells it on any platform: the build resolves the guide's imports with `path.resolve`.
  readFile: (path) => files[path.replace(/\\/gu, '/').replace(/^[A-Za-z]:/u, '')],
  realPath: (path) => path,
});

const json = (value: unknown): string => JSON.stringify(value);

/** tienda depends on the guide library; the guide has tokens, base, h1, button and a logo. */
const WORKSPACE: Readonly<Record<string, string>> = {
  [`${APP}/package.json`]: json({ name: '@acme/tienda', dependencies: { '@acme/guide': 'workspace:*' } }),
  [`${APP}/fudic.json`]: json({ kind: 'app', id: 'tienda', styles: { panel: 'panel.css' } }),
  [`${APP}/panel.css`]: '.panel { padding: 0; }',
  [`${GUIDE}/package.json`]: json({ name: '@acme/guide' }),
  [`${GUIDE}/fudic.json`]: json({
    kind: 'lib',
    globalStyles: { base: 'base.css' },
    guide: { sheet: 'guide.css', icon: 'logo.svg' },
  }),
  [`${GUIDE}/guide.css`]: '@import "./tokens.css";\n@import "./base.css";\n@import "./h1.css";\n@import "./button.css";',
  [`${GUIDE}/tokens.css`]: ':root { --ink: #111; }',
  [`${GUIDE}/base.css`]: '* { box-sizing: border-box; }',
  [`${GUIDE}/h1.css`]: 'h1 { color: var(--ink); }',
  [`${GUIDE}/button.css`]: 'button { background: url(./icons/b.svg); }',
  [`${GUIDE}/logo.svg`]: '<svg/>',
};

const ROUTE = `${APP}/src/routes/index.fud`;

describe('ProjectStyleChains and the guide', () => {
  it('a component of the app may adopt the pieces of its chain, with its own styles', () => {
    const chains = new ProjectStyleChains(APP, fs(WORKSPACE));
    expect([...chains.choosableFor(`${APP}/src/components/x.fud`).keys()]).toEqual(['h1', 'button', 'panel']);
    expect(chains.piecesFor(`${APP}/src/components/x.fud`).map((p) => p.name)).toEqual(['h1', 'button']);
    // A piece is adopted from its file: its url() resolve from it (§4.6).
    expect(chains.choosableFor(`${APP}/src/x.fud`).get('button')?.file).toBe(`${GUIDE}/button.css`);
    expect(chains.diagnostics).toEqual([]);
  });

  it('the entry links the guide of its chain, flattened from its folder, and gets its icon', () => {
    const chains = new ProjectStyleChains(APP, fs(WORKSPACE));
    const [guide] = chains.guidesFor(ROUTE);
    expect(guide?.spec).toBe('../../node_modules/@acme/guide/guide.css');
    expect(guide?.sheet.css).toContain(':root');
    expect(guide?.sheet.css).toContain('url(../../node_modules/@acme/guide/icons/b.svg)');
    expect(chains.guidesFor(ROUTE)).toBe(chains.guidesFor(ROUTE));
    expect(chains.iconFor(ROUTE)).toBe('../../node_modules/@acme/guide/logo.svg');
  });

  it('a chain with no guide links nothing and has no icon', () => {
    const chains = new ProjectStyleChains('/p', fs({ '/p/fudic.json': json({ kind: 'app', id: 'p' }) }));
    expect(chains.guidesFor('/p/a.fud')).toEqual([]);
    expect(chains.iconFor('/p/a.fud')).toBeUndefined();
    expect(chains.piecesFor('/p/a.fud')).toEqual([]);
  });

  it('two guides, both, the library first; the icon is the nearest one\'s (criterion 9, §4.7)', () => {
    const chains = new ProjectStyleChains(
      APP,
      fs({
        ...WORKSPACE,
        [`${APP}/fudic.json`]: json({ kind: 'app', id: 'tienda', guide: { sheet: 'own/guide.css', icon: 'own/icon.png' } }),
        [`${APP}/own/guide.css`]: '@import "./p.css";',
        [`${APP}/own/p.css`]: 'p { margin: 0; }',
        [`${APP}/own/icon.png`]: 'png',
      }),
    );
    expect(chains.guidesFor(ROUTE).map((g) => g.spec)).toEqual(['../../node_modules/@acme/guide/guide.css', '../../own/guide.css']);
    expect(chains.iconFor(ROUTE)).toBe('../../own/icon.png');
    expect(chains.piecesFor(ROUTE).map((p) => p.name)).toEqual(['h1', 'button', 'p']);
  });

  it('the icon of a guide that declares none is not the nearest', () => {
    const chains = new ProjectStyleChains(
      APP,
      fs({
        ...WORKSPACE,
        [`${APP}/fudic.json`]: json({ kind: 'app', id: 'tienda', guide: { sheet: 'g.css' } }),
        [`${APP}/g.css`]: '',
      }),
    );
    expect(chains.iconFor(ROUTE)).toBe('../../node_modules/@acme/guide/logo.svg');
  });

  it('FUD0741: a sheet of the app named like a piece of the guide (criterion 12)', () => {
    const chains = new ProjectStyleChains(
      APP,
      fs({
        ...WORKSPACE,
        [`${APP}/fudic.json`]: json({ kind: 'app', id: 'tienda', styles: { button: 'button.css' } }),
        [`${APP}/button.css`]: 'button {}',
      }),
    );
    expect(chains.choosableFor(ROUTE).get('button')?.file).toBe(`${GUIDE}/button.css`);
    const clash = chains.diagnostics.find((d) => d.code === 'FUD0741');
    expect(clash?.message).toContain('@acme/guide');
  });

  it('a piece that clashes with a sheet before it is not a piece', () => {
    const chains = new ProjectStyleChains(
      APP,
      fs({
        ...WORKSPACE,
        [`${GUIDE}/fudic.json`]: json({ kind: 'lib', globalStyles: { base: 'base.css' }, styles: { h1: 'other.css' }, guide: { sheet: 'guide.css' } }),
        [`${GUIDE}/other.css`]: 'h1 {}',
      }),
    );
    expect(chains.piecesFor(ROUTE).map((p) => p.name)).toEqual(['button']);
  });

  it('FUD0854 for a piece with an @import, FUD0743 for its document rule (criterion 13)', () => {
    const chains = new ProjectStyleChains(
      APP,
      fs({
        ...WORKSPACE,
        [`${APP}/fudic.json`]: json({ kind: 'app', id: 'tienda', guide: { sheet: 'g.css' } }),
        [`${APP}/g.css`]: '@import "./p.css";',
        [`${APP}/p.css`]: '@import "./q.css";\np { margin: 0; }\nbody { margin: 0; }',
        [`${APP}/q.css`]: 'q {}',
      }),
    );
    const own = chains.own(APP);
    expect(own.errors.map((d) => [d.code, d.file])).toEqual([['FUD0854', 'p.css']]);
    expect(own.warnings.map((d) => [d.code, d.file])).toEqual([['FUD0743', 'p.css']]);
  });
});

describe('readPackageGuide', () => {
  const read = (files: Readonly<Record<string, string>>, guide?: unknown) =>
    readPackageGuide(
      '/g',
      { kind: 'lib', styles: [], globalStyles: [], ...(guide === undefined ? {} : { guide }) } as never,
      ['/g/base.css'],
      fs(files),
    );

  it('nothing for a package that declares no guide', () => {
    expect(read({})).toEqual({ errors: [], warnings: [], files: [] });
  });

  it('FUD0740 when its sheet is not there', () => {
    expect(read({}, { sheet: 'guide.css' }).errors.map((d) => [d.code, d.file])).toEqual([['FUD0740', 'fudic.json']]);
  });

  it('FUD1443 over the icon\'s value in fudic.json when it is not there (criterion 17)', () => {
    const config = '{\n  "kind": "lib",\n  "guide": { "sheet": "guide.css", "icon": "logo.svg" }\n}\n';
    const result = read({ '/g/fudic.json': config, '/g/guide.css': '' }, { sheet: 'guide.css', icon: 'logo.svg' });
    const [d] = result.errors;
    expect(d?.code).toBe('FUD1443');
    expect(config.slice(d!.span!.start, d!.span!.end)).toBe('"logo.svg"');
    expect(result.guide).not.toHaveProperty('icon');
  });

  it('FUD1443 with no span when fudic.json cannot be read back', () => {
    const result = read({ '/g/guide.css': '' }, { sheet: 'guide.css', icon: 'logo.svg' });
    expect(result.errors[0]?.code).toBe('FUD1443');
    expect(result.errors[0]).not.toHaveProperty('span');
  });

  it('what the guide says of itself, in the files that say it: FUD1442, a missing import, a late one', () => {
    const result = read(
      {
        '/g/guide.css': '@import "./my-button.css";\n@import "./gone.css";\np {}\n@import "./late.css";',
        '/g/my-button.css': 'button {}',
        '/g/late.css': 'em {}',
      },
      { sheet: 'guide.css' },
    );
    expect(result.errors.map((d) => [d.code, d.file])).toEqual([
      ['FUD1442', 'guide.css'],
      ['FUD0853', 'guide.css'],
    ]);
    expect(result.warnings.map((d) => [d.code, d.file])).toEqual([['FUD0857', 'guide.css']]);
  });

  it('the globals are never pieces; each piece is a file to check', () => {
    const result = read({ '/g/guide.css': '@import "./base.css";\n@import "./h1.css";', '/g/base.css': '* {}', '/g/h1.css': 'h1 {}' }, { sheet: 'guide.css' });
    expect(result.guide?.pieces.map((p) => p.path)).toEqual(['/g/h1.css']);
    expect(result.files).toEqual([{ specifier: 'h1', entry: 'h1.css', path: '/g/h1.css', css: 'h1 {}' }]);
  });
});

describe('entryGuide and specFrom', () => {
  it('flattens the guide from the entry\'s folder', () => {
    const guide = { sheet: '/g/guide.css', globals: ['/g/base.css'], pieces: [] };
    const files = fs({ '/g/guide.css': '@import "./h1.css";', '/g/h1.css': 'h1 { background: url(./x.png); }' });
    const sheet = entryGuide(guide, '/app/src/index.fud', files);
    expect(sheet.spec).toBe('../../g/guide.css');
    expect(sheet.sheet.css).toContain('url(../../g/x.png)');
  });

  it('writes a sibling with ./ and a cousin with ../', () => {
    expect(specFrom('/a', '/a/b.css')).toBe('./b.css');
    expect(specFrom('/a/x', '/a/b.css')).toBe('../b.css');
  });
});
