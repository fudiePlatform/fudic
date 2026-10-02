import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { SpecHost } from '../../src/fudspec/host.js';
import { nodeSpecFs } from '../../src/fudspec/node-spec-fs.js';
import { createFudspecLanguagePlugin, FUDSPEC_LANGUAGE_ID } from '../../src/fudspec/language-plugin.js';
import { isFudspecUri } from '../../src/uri.js';
import { URI } from 'vscode-uri';
import { component } from '../_support.js';
import { FILES, FUDS, FW_TERMS, ROOT, SPEC_PATH, WS_TERMS, termSource, world } from './_spec.js';

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

  it('has no workspace layer for a file outside every folder', () => {
    const { host } = world();
    const terms = host.terms('/elsewhere/x.fudspec');
    expect(terms.list('then').map((m) => [m.name, m.layer])).toEqual([['visible', 'framework']]);
  });

  it('has no framework layer when the host is given none', () => {
    const { host } = world({ frameworkTerms: null });
    expect(host.terms(SPEC_PATH).list('then').map((m) => m.name)).toEqual(['min-height']);
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
  ])('affects(%s) is %s', (path, expected) => {
    expect(SpecHost.affects(path)).toBe(expected);
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
