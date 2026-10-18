import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { installedTerms, SpecHost, TERMS_PACKAGE } from '../../src/fudspec/host.js';
import { nodeSpecFs } from '../../src/fudspec/node-spec-fs.js';
import { createFudspecLanguagePlugin, FUDSPEC_LANGUAGE_ID } from '../../src/fudspec/language-plugin.js';
import { isFudspecUri } from '../../src/uri.js';
import { URI } from 'vscode-uri';
import { component } from '../_support.js';
import { FILES, FUDS, FW_TERMS, ROOT, SPEC_PATH, WS_TERMS, specFs, termSource, world } from './_spec.js';

describe('SpecHost — term roots (SDD-52 §8.2)', () => {
  it('reads the workspace folder first, then the framework', () => {
    const { host } = world({
      files: {
        [`${WS_TERMS}/then/visible.js`]: termSource('visible', 'then'),
        [`${FW_TERMS}/then/visible.js`]: termSource('visible', 'then'),
        [`${FW_TERMS}/then/hidden.js`]: termSource('hidden', 'then'),
      },
    });
    const terms = host.terms(SPEC_PATH);
    expect(terms.resolve('then', 'visible')?.layer).toBe('workspace');
    expect(terms.resolve('then', 'hidden')?.layer).toBe('framework');
  });

  it('takes the longest workspace folder that contains the file', () => {
    const inner = `${ROOT}/apps/shop`;
    const { host } = world({
      // The shorter folder listed last: the longest wins whatever the order.
      roots: [inner, ROOT],
      files: { [`${inner}/fudic/terms/then/shop.js`]: termSource('shop', 'then') },
    });
    expect(host.terms(`${inner}/x.fudspec`).resolve('then', 'shop')?.path).toBe(`${inner}/fudic/terms/then/shop.js`);
    expect(host.terms(SPEC_PATH).resolve('then', 'shop')).toBeUndefined();
  });

  it('reads the terms of the nearest project with a fudic.json, inside the workspace folder', () => {
    // A monorepo opened at its root: the terms belong to the project, next to its fudic.json.
    const app = `${ROOT}/examples/basic`;
    const { host } = world({
      files: {
        ...FILES,
        // Above the workspace folder: never a project of this file.
        '/fudic.json': '{}',
        [`${app}/fudic.json`]: '{}',
        [`${app}/fudic/terms/then/shop.js`]: termSource('shop', 'then'),
      },
    });
    const inApp = host.terms(`${app}/src/components/app-card.fudspec`);
    expect(inApp.resolve('then', 'shop')?.path).toBe(`${app}/fudic/terms/then/shop.js`);
    // The workspace layer is the project's alone: the repository's terms are not merged in.
    expect(inApp.resolve('then', 'min-height')).toBeUndefined();
    // Outside any project, the workspace folder — and a catalog of its own.
    const atRoot = host.terms(SPEC_PATH);
    expect(atRoot).not.toBe(inApp);
    expect(atRoot.resolve('then', 'min-height')?.path).toBe(`${WS_TERMS}/then/min-height.js`);
    expect(atRoot.resolve('then', 'shop')).toBeUndefined();
  });

  it('has no layer at all for a file outside every folder: no project, so no @fudic/terms either', () => {
    const asked: string[] = [];
    const { host } = world({ framework: (folder) => (asked.push(folder), FW_TERMS) });
    const terms = host.terms('/elsewhere/x.fudspec');
    expect(terms.list('then')).toEqual([]);
    expect(asked).toEqual([]);
  });

  it('asks for the framework layer of each project by its folder (SDD-59 §4.10)', () => {
    const app = `${ROOT}/apps/shop`;
    const lib = `${ROOT}/libs/ui`;
    const asked: string[] = [];
    const { host } = world({
      files: {
        ...FILES,
        [`${app}/fudic.json`]: '{}',
        [`${lib}/fudic.json`]: '{}',
        '/shop-terms/then/hidden.js': termSource('hidden', 'then'),
      },
      framework: (folder) => {
        asked.push(folder);
        return folder === app ? '/shop-terms' : undefined;
      },
    });
    expect(host.terms(`${app}/src/x.fudspec`).list('then').map((m) => [m.name, m.layer])).toEqual([['hidden', 'framework']]);
    expect(host.terms(`${lib}/src/x.fudspec`).list('then')).toEqual([]);
    expect(asked).toEqual([app, lib]);
  });

  it('has no framework layer when the project has not installed @fudic/terms', () => {
    const { host } = world({ frameworkTerms: null });
    expect(host.terms(SPEC_PATH).list('then').map((m) => m.name)).toEqual(['min-height']);
  });

  it('by default, the framework layer is the terms/ of the @fudic/terms the project installed', () => {
    const installed = `${ROOT}/node_modules/@fudic/terms/terms`;
    const { host } = world({
      frameworkTerms: null,
      files: { ...FILES, [`${installed}/then/focused.js`]: termSource('focused', 'then', [{ name: 'target', type: 'element' }]) },
    });
    expect(host.terms(SPEC_PATH).list('then').map((m) => [m.name, m.layer, m.path])).toEqual([
      ['focused', 'framework', `${installed}/then/focused.js`],
      ['min-height', 'workspace', `${WS_TERMS}/then/min-height.js`],
    ]);
  });

  it('keeps one catalog per folder until invalidated', () => {
    const { host } = world();
    const first = host.terms(SPEC_PATH);
    expect(host.terms(`${ROOT}/other.fudspec`)).toBe(first);
    host.invalidate();
    expect(host.terms(SPEC_PATH)).not.toBe(first);
  });
});

describe('SpecHost — components and fixtures (SDD-52 §8.2)', () => {
  it('answers components from the index, with their required props', () => {
    const { host } = world();
    expect(host.component('fud-card')).toEqual({
      tag: 'fud-card',
      path: `${ROOT}/components/fud-card.fud`,
      requiredProps: ['title'],
    });
    expect(host.component('fud-button')?.requiredProps).toEqual([]);
    expect(host.component('fud-nope')).toBeUndefined();
    expect(host.component('')).toBeUndefined();
  });

  it('lists component tags sorted and once, without a file that has no tag yet', () => {
    const { host } = world({
      fuds: { ...FUDS, [`${ROOT}/legacy/fud-button.fud`]: component('fud-button') },
    });
    expect(host.componentTags()).toEqual(['fud-button', 'fud-card']);
  });

  it('reads the fixture next to the .fud', () => {
    const { host } = world();
    expect(host.fixturePath('fud-card')).toBe(`${ROOT}/components/fud-card.fixture.ts`);
    expect(host.fixtures('fud-card')?.names.map((n) => n.text)).toEqual(['titulo-largo', 'vacio']);
  });

  it('has no fixtures without a component or without a file', () => {
    const { host } = world();
    expect(host.fixturePath('fud-nope')).toBeUndefined();
    expect(host.fixtures('fud-nope')).toBeUndefined();
    expect(host.fixtures('fud-button')).toBeUndefined();
  });

  it('builds the validator context over itself', () => {
    const { host } = world();
    const ctx = host.context(SPEC_PATH);
    expect(ctx.terms).toBe(host.terms(SPEC_PATH));
    expect(ctx.component('fud-card')?.tag).toBe('fud-card');
    expect(ctx.fixtures('fud-card')?.names).toHaveLength(2);
    expect(host.read(`${ROOT}/components/fud-card.fixture.ts`)).toContain('vacio');
  });

  it.each([
    [`${ROOT}/fudic/terms/then/min-height.js`, true],
    [`${ROOT}/components/fud-card.fixture.ts`, true],
    [`${ROOT}/components/fud-card.fud`, true],
    [`${ROOT}/fudic/terms/then/notes.md`, false],
    [`${ROOT}/src/helper.js`, false],
    [`${ROOT}/tsconfig.json`, false],
    // Where a project installs or drops @fudic/terms (SDD-59 §4.10).
    [`${ROOT}/package.json`, true],
    [`${ROOT}/apps/shop/package.json`, true],
    [`${ROOT}/package.json.bak`, false],
    [`${ROOT}/my-package.json`, false],
  ])('affects(%s) is %s', (path, expected) => {
    expect(SpecHost.affects(path)).toBe(expected);
  });
});

describe('installedTerms — the @fudic/terms a project installed (SDD-59 §4.10)', () => {
  const PKG = `node_modules/${TERMS_PACKAGE}`;
  const lookup = (files: Record<string, string>) => installedTerms(specFs(files));

  it('finds it in the project folder', () => {
    expect(lookup({ [`/ws/app/${PKG}/terms/then/visible.js`]: '' })('/ws/app')).toBe(`/ws/app/${PKG}/terms`);
  });

  it('finds it in a folder above, as Node resolves a package', () => {
    expect(lookup({ [`/ws/${PKG}/terms/then/visible.js`]: '' })('/ws/apps/shop')).toBe(`/ws/${PKG}/terms`);
  });

  it('takes the nearest one', () => {
    const find = lookup({ [`/ws/${PKG}/terms/then/a.js`]: '', [`/ws/apps/shop/${PKG}/terms/then/b.js`]: '' });
    expect(find('/ws/apps/shop')).toBe(`/ws/apps/shop/${PKG}/terms`);
    expect(find('/ws/apps/blog')).toBe(`/ws/${PKG}/terms`);
  });

  it('finds nothing when no folder up to the root has it, nor a package without its terms/', () => {
    expect(lookup({ [`/ws/${PKG}/dist/index.js`]: '' })('/ws/app')).toBeUndefined();
    expect(lookup({})('/ws/app')).toBeUndefined();
  });

  it('reaches the root of a Windows drive', () => {
    expect(lookup({ [`C:/${PKG}/terms/then/a.js`]: '' })('C:/ws/app')).toBe(`C:/${PKG}/terms`);
  });
});

describe('nodeSpecFs', () => {
  it('lists and reads the disk, and answers nothing for what is not there', () => {
    const root = mkdtempSync(join(tmpdir(), 'fudspec-'));
    mkdirSync(join(root, 'then'));
    writeFileSync(join(root, 'then', 'visible.js'), 'export {}');
    const fs = nodeSpecFs();
    expect(fs.readDirectory(join(root, 'then'))).toEqual(['visible.js']);
    expect(fs.readFile(join(root, 'then', 'visible.js'))).toBe('export {}');
    expect(fs.readDirectory(join(root, 'when'))).toEqual([]);
    expect(fs.readFile(join(root, 'then', 'nope.js'))).toBeUndefined();
  });
});

describe('the .fudspec language plugin (criterion 24)', () => {
  const plugin = createFudspecLanguagePlugin();
  const snapshot = { getText: () => 'component x', getLength: () => 11, getChangeRange: () => undefined };
  const spec = URI.file(SPEC_PATH);
  const fud = URI.file(`${ROOT}/components/fud-card.fud`);

  it('claims only .fudspec', () => {
    expect(isFudspecUri(spec)).toBe(true);
    expect(isFudspecUri(fud)).toBe(false);
    expect(plugin.getLanguageId(spec)).toBe(FUDSPEC_LANGUAGE_ID);
    expect(plugin.getLanguageId(fud)).toBeUndefined();
  });

  it('makes one root code mapped whole, with nothing embedded', () => {
    const code = plugin.createVirtualCode?.(spec, 'plaintext', snapshot, {} as never);
    expect(code).toMatchObject({ id: 'root', languageId: 'fudspec', snapshot });
    expect(code?.embeddedCodes).toBeUndefined();
    expect(code?.mappings).toEqual([
      { sourceOffsets: [0], generatedOffsets: [0], lengths: [11], data: expect.objectContaining({ format: true, completion: true }) },
    ]);
  });

  it('takes the editor languageId too, and nothing else', () => {
    const untitled = URI.parse('untitled:Untitled-1');
    expect(plugin.createVirtualCode?.(untitled, 'fudspec', snapshot, {} as never)?.id).toBe('root');
    expect(plugin.createVirtualCode?.(fud, 'fudic', snapshot, {} as never)).toBeUndefined();
  });

  it('rebuilds the code on update', () => {
    const next = { ...snapshot, getLength: () => 3 };
    const code = plugin.updateVirtualCode?.(spec, {} as never, next, {} as never);
    expect(code?.mappings[0]?.lengths).toEqual([3]);
  });
});
