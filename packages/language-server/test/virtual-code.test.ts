/**
 * The `VirtualCode` tree and the language plugin (SDD-24 §4.1).
 *
 * Driven without a Volar server on purpose: everything Volar needs from this package is
 * reachable through the plugin's own methods, and a full LSP round trip belongs to phase 7.
 */

import { describe, expect, it } from 'vitest';
import { URI } from 'vscode-uri';
import { DocumentCache, type CachedDocument } from '../src/document-cache.js';
import { createFudicLanguagePlugin } from '../src/language-plugin.js';
import { WorkspaceIndex } from '../src/workspace-index.js';
import {
  CLIENT_CODE_ID,
  createFudicVirtualCode,
  FUD_LANGUAGE_ID,
  SERVER_CODE_ID,
  snapshotOf,
  styleCodeId,
} from '../src/virtual-code.js';
import { component, LAYOUT, memoryFs, route } from './_support.js';

const BADGE_PATH = '/p/components/app-badge.fud';
const BADGE = `@code {
  const { tone = 'neutral' } = props<{ tone?: string }>();
}

<head>
  <style>:host { display: inline-block; }</style>
</head>

<app-badge>
  <template shadowrootmode="open">
    <span>@tone</span>
  </template>
</app-badge>
`;

function setup() {
  const files: Record<string, string> = {
    [BADGE_PATH]: BADGE,
    '/p/layouts/_layout.fud': LAYOUT,
    '/p/blog/[slug].fud': route('../layouts/_layout.fud', ['../components/app-badge.fud']),
  };
  const index = new WorkspaceIndex(memoryFs(files));
  index.scan('/p');
  const cache = new DocumentCache(index);

  return { files, index, cache, plugin: createFudicLanguagePlugin(cache) };
}

describe('snapshotOf', () => {
  it('is a script snapshot over a string', () => {
    const snapshot = snapshotOf('hello');

    expect(snapshot.getLength()).toBe(5);
    expect(snapshot.getText(1, 3)).toBe('el');
    expect(snapshot.getChangeRange(snapshotOf('hell'))).toBeUndefined();
  });
});

describe('createFudicVirtualCode', () => {
  it('roots the file and embeds client, server and one code per <style>', () => {
    const { cache } = setup();
    const root = createFudicVirtualCode(cache.get(BADGE_PATH, 1, BADGE));

    expect(root.id).toBe('root');
    expect(root.languageId).toBe(FUD_LANGUAGE_ID);
    expect(root.snapshot.getLength()).toBe(BADGE.length);
    expect(root.embeddedCodes?.map((code) => code.id)).toEqual([
      CLIENT_CODE_ID,
      SERVER_CODE_ID,
      styleCodeId(0),
    ]);
    expect(root.styles.length).toBe(1);
    expect(root.styles[0]?.languageId).toBe('css');
  });

  it('maps the root onto itself so the server’s own features have a table', () => {
    const { cache } = setup();
    const root = createFudicVirtualCode(cache.get(BADGE_PATH, 1, BADGE));

    expect(root.mappings).toEqual([
      {
        sourceOffsets: [0],
        generatedOffsets: [0],
        lengths: [BADGE.length],
        data: {
          verification: true,
          completion: true,
          semantic: true,
          navigation: true,
          structure: true,
          format: true,
        },
      },
    ]);
  });

  it('projects user text 1:1, so every navigable stretch still reads as itself', () => {
    const { cache } = setup();
    const root = createFudicVirtualCode(cache.get(BADGE_PATH, 1, BADGE));
    const text = root.client.snapshot.getText(0, root.client.snapshot.getLength());

    for (const mapping of root.client.mappings) {
      if (mapping.data.navigation !== true) continue;
      const [generated] = mapping.generatedOffsets;
      const [source] = mapping.sourceOffsets;
      const length = mapping.generatedLengths?.[0] ?? mapping.lengths[0] ?? 0;
      if (mapping.generatedLengths !== undefined) continue; // stands for other text
      expect(text.slice(generated, (generated ?? 0) + length)).toBe(
        BADGE.slice(source, (source ?? 0) + length),
      );
    }
  });

  it('substitutes empty codes when a projection is missing, instead of dying', () => {
    const { cache } = setup();
    const real = cache.get(BADGE_PATH, 1, BADGE);
    const bare: CachedDocument = { ...real, virtuals: [] };
    const root = createFudicVirtualCode(bare);

    expect(root.client.snapshot.getLength()).toBe(0);
    expect(root.server.mappings).toEqual([]);
    expect(root.styles).toEqual([]);
  });
});

describe('the language plugin', () => {
  const uri = URI.file(BADGE_PATH);

  it('claims .fud and nothing else', () => {
    const { plugin } = setup();

    expect(plugin.getLanguageId(uri)).toBe(FUD_LANGUAGE_ID);
    expect(plugin.getLanguageId(URI.file('/p/data/posts.ts'))).toBeUndefined();
  });

  it('builds a virtual code for a .fud and ignores other languages', () => {
    const { plugin } = setup();
    const ctx = { getAssociatedScript: () => undefined };

    const code = plugin.createVirtualCode?.(uri, FUD_LANGUAGE_ID, snapshotOf(BADGE), ctx);
    expect(code?.document.path).toBe(BADGE_PATH);
    expect(
      plugin.createVirtualCode?.(URI.file('/p/data/posts.ts'), 'typescript', snapshotOf(''), ctx),
    ).toBeUndefined();
  });

  it('builds it under whatever id the editor registered .fud as', () => {
    // VS Code contributes `fudic`, not `fud` (SDD-25 §3.1), and Volar passes the client's id
    // straight through. Keying on the id alone builds nothing for a real editor, and a server
    // with no virtual code answers every request with nothing at all.
    const { plugin } = setup();
    const ctx = { getAssociatedScript: () => undefined };

    const code = plugin.createVirtualCode?.(uri, 'fudic', snapshotOf(BADGE), ctx);
    expect(code?.document.path).toBe(BADGE_PATH);
  });

  it('re-parses the whole document on update, which is what §7 defers', () => {
    const { plugin } = setup();
    const ctx = { getAssociatedScript: () => undefined };

    const first = plugin.createVirtualCode?.(uri, FUD_LANGUAGE_ID, snapshotOf(BADGE), ctx);
    const edited = `${BADGE}<!-- more -->\n`;
    const second = plugin.updateVirtualCode?.(uri, first!, snapshotOf(edited), ctx);

    expect(second?.document.version).toBe(2);
    expect(second?.document.source).toBe(edited);
    expect(second?.document.document).not.toBe(first?.document.document);
  });

  it('forgets a closed document', () => {
    const { plugin, cache } = setup();
    const ctx = { getAssociatedScript: () => undefined };

    const first = plugin.createVirtualCode?.(uri, FUD_LANGUAGE_ID, snapshotOf(BADGE), ctx);
    plugin.disposeVirtualCode?.(uri, first!);
    const reopened = plugin.createVirtualCode?.(uri, FUD_LANGUAGE_ID, snapshotOf(BADGE), ctx);

    expect(reopened?.document.version).toBe(1);
    expect(cache.get(BADGE_PATH, 1, BADGE)).not.toBe(first?.document);
  });

  it('tells TypeScript that a .fud is mixed content with a deferred script kind', () => {
    const { plugin } = setup();

    expect(plugin.typescript?.extraFileExtensions).toEqual([
      { extension: 'fud', isMixedContent: true, scriptKind: 7 },
    ]);
  });

  it('hands the client projection over as the file’s script', () => {
    const { plugin } = setup();
    const ctx = { getAssociatedScript: () => undefined };
    const root = plugin.createVirtualCode?.(uri, FUD_LANGUAGE_ID, snapshotOf(BADGE), ctx);

    const script = plugin.typescript?.getServiceScript(root!);
    expect(script?.code.id).toBe(CLIENT_CODE_ID);
    expect(script?.extension).toBe('.ts');
    expect(script?.scriptKind).toBe(3);
  });

  it('gives the server projection a file name to be imported by', () => {
    const { plugin } = setup();
    const ctx = { getAssociatedScript: () => undefined };
    const root = plugin.createVirtualCode?.(uri, FUD_LANGUAGE_ID, snapshotOf(BADGE), ctx);

    const [extra] = plugin.typescript?.getExtraServiceScripts?.(BADGE_PATH, root!) ?? [];
    expect(extra?.fileName).toBe(`${BADGE_PATH}.server.ts`);
    expect(extra?.code.id).toBe(SERVER_CODE_ID);
  });
});

describe('a half-written file', () => {
  it('still yields virtual codes: an editor is where broken input lives', () => {
    const { cache } = setup();
    const broken = `${component('app-x')}<div>\n@if (`;
    const root = createFudicVirtualCode(cache.get('/p/components/app-x.fud', 1, broken));

    expect(root.client.snapshot.getLength()).toBeGreaterThan(0);
    expect(root.document.diagnostics.length).toBeGreaterThan(0);
  });
});
