/**
 * Criteria §6.1 and §6.15: the server starts against the fixture workspace, declares what it can
 * do, and can show what it is teaching `tsserver`.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness, type Harness } from './_harness.js';
import { VIRTUAL_FILES_REQUEST, type VirtualFilePayload } from '../../src/requests.js';

describe('§6.1 — start-up', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness();
  }, 60_000);

  afterAll(async () => {
    await harness.stop();
  });

  it('declares the capabilities of §3.2', () => {
    const { capabilities } = harness.capabilities;

    expect(capabilities.textDocumentSync).toBe(2);
    expect(capabilities.completionProvider?.triggerCharacters).toEqual([
      '@',
      '<',
      '.',
      ':',
      '"',
      '/',
      ' ',
    ]);
    expect(capabilities.hoverProvider).toBe(true);
    expect(capabilities.definitionProvider).toBe(true);
    expect(capabilities.typeDefinitionProvider).toBe(true);
    expect(capabilities.referencesProvider).toBe(true);
    expect(capabilities.renameProvider).toEqual({ prepareProvider: true });
    expect(capabilities.documentSymbolProvider).toBe(true);
    expect(capabilities.documentFormattingProvider).toBe(true);
    expect(capabilities.documentRangeFormattingProvider).toBe(true);
    expect(capabilities.documentLinkProvider).toEqual({ resolveProvider: false });
    expect(capabilities.codeActionProvider).toBe(true);
    expect(capabilities.diagnosticProvider).toEqual({
      interFileDependencies: true,
      workspaceDiagnostics: false,
    });
    expect(capabilities.semanticTokensProvider).toBeDefined();
  });

  it('indexed the four .fud of the workspace, by role', () => {
    expect(harness.server.index.byRole('component').map((entry) => entry.tag).sort()).toEqual([
      'app-badge',
      'site-nav',
    ]);
    expect(harness.server.index.byRole('layout').length).toBe(1);
    expect(harness.server.index.byRole('route').length).toBe(1);
  });
});

describe('§6.15 — fudic/virtualFiles', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness();
  }, 60_000);

  afterAll(async () => {
    await harness.stop();
  });

  it('returns the virtuals of [slug].fud with their text', async () => {
    const { uri } = await harness.open('blog/[slug].fud');
    const files = (await harness.client.sendRequest(VIRTUAL_FILES_REQUEST, {
      uri,
    })) as VirtualFilePayload[];

    expect(files.map((file) => file.languageId)).toEqual(['typescript', 'typescript']);
    expect(files[0]?.fileName.endsWith('[slug].fud.ts')).toBe(true);
    expect(files[0]?.text).toContain('$tpl');
    expect(files[1]?.text).toContain('export async function load');
  });

  it('returns the CSS virtual of a component with a <style>', async () => {
    const { uri } = await harness.open('components/app-badge.fud');
    const files = (await harness.client.sendRequest(VIRTUAL_FILES_REQUEST, {
      uri,
    })) as VirtualFilePayload[];

    expect(files.map((file) => file.languageId)).toEqual(['typescript', 'typescript', 'css']);
    expect(files[2]?.text).toContain(':host');
  });
});

describe('§6.1 — degradation', () => {
  it('starts without a usable tsdk and still declares its capabilities', async () => {
    const harness = await startHarness({ tsdk: '/nowhere/at/all' });

    try {
      expect(harness.capabilities.capabilities.completionProvider).toBeDefined();
      expect(harness.capabilities.capabilities.diagnosticProvider).toBeDefined();
    } finally {
      await harness.stop();
    }
  }, 60_000);
});
