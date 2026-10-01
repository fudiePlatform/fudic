/**
 * The Volar language plugin and the `VirtualCode` tree it builds (SDD-24 §4.1, SDD-35 §4.2).
 *
 * Driven without Volar on purpose: everything Volar asks of the plugin is reachable through its
 * own methods. The editor and the build mount this one plugin, and differ only in how they name
 * a script and where its document comes from — both injected, both exercised here.
 */

import { describe, expect, it } from 'vitest';
import type { VirtualCode } from '@volar/language-core';
import {
  CLIENT_CODE_ID,
  createFudicVirtualCode,
  FUD_LANGUAGE_ID,
  fudLanguagePlugin,
  projectFud,
  SERVER_CODE_ID,
  snapshotOf,
  styleCodeId,
  type FudicVirtualCode,
  type ProjectedFud,
} from '../src/index.js';
import { indexOf } from './_support.js';

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

/** A plugin over a document source that records what it was asked. */
function setup(options: { readonly fudSource?: (id: string) => boolean } = {}) {
  const index = indexOf({ [BADGE_PATH]: BADGE });
  const asked: string[] = [];
  const plugin = fudLanguagePlugin<string>({
    isFud: (id) => id.endsWith('.fud'),
    ...(options.fudSource === undefined ? {} : { isFudSource: options.fudSource }),
    pathOf: (id) => id.replace(/^file:\/\//u, ''),
    documents: {
      get(path, version, source): ProjectedFud {
        asked.push(`get ${path} v${version}`);
        return projectFud({ path, source, index });
      },
      invalidate(path) {
        asked.push(`invalidate ${path}`);
      },
    },
  });
  return { plugin, asked };
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
  const document = projectFud({ path: BADGE_PATH, source: BADGE, index: indexOf({}) });

  it('roots the file and embeds client, server and one code per <style>', () => {
    const root = createFudicVirtualCode(document);

    expect(root.id).toBe('root');
    expect(root.languageId).toBe(FUD_LANGUAGE_ID);
    expect(root.snapshot.getLength()).toBe(BADGE.length);
    expect(root.mappings).toHaveLength(1);
    expect(root.embeddedCodes?.map((code) => code.id)).toEqual([CLIENT_CODE_ID, SERVER_CODE_ID, styleCodeId(0)]);
    expect(root.client.languageId).toBe('typescript');
    expect(root.styles[0]?.languageId).toBe('css');
    expect(root.document).toBe(document);
  });

  it('stands in an empty code for a projection that was not emitted', () => {
    const root = createFudicVirtualCode({ ...document, virtuals: [] });

    expect(root.client).toMatchObject({ id: CLIENT_CODE_ID, languageId: 'typescript', mappings: [] });
    expect(root.server).toMatchObject({ id: SERVER_CODE_ID, languageId: 'typescript', mappings: [] });
    expect(root.client.snapshot.getLength()).toBe(0);
    expect(root.styles).toEqual([]);
  });
});

describe('fudLanguagePlugin', () => {
  it('names the .fud language by the script id', () => {
    const { plugin } = setup();

    expect(plugin.getLanguageId('/p/a.fud')).toBe(FUD_LANGUAGE_ID);
    expect(plugin.getLanguageId('/p/a.ts')).toBeUndefined();
  });

  it("builds a code whatever language id the editor chose, and none for what is not a .fud", () => {
    const { plugin, asked } = setup();
    const snapshot = snapshotOf(BADGE);

    expect(plugin.createVirtualCode?.(BADGE_PATH, 'fudic', snapshot, {} as never)?.id).toBe('root');
    expect(plugin.createVirtualCode?.('/p/x.txt', FUD_LANGUAGE_ID, snapshot, {} as never)?.id).toBe('root');
    expect(plugin.createVirtualCode?.('/p/x.ts', 'typescript', snapshot, {} as never)).toBeUndefined();
    expect(asked).toEqual([`get ${BADGE_PATH} v1`, 'get /p/x.txt v1']);
  });

  it('builds for a source the host says is a .fud even under another name', () => {
    const { plugin } = setup({ fudSource: (id) => id.endsWith('.copy') });

    expect(plugin.createVirtualCode?.('/p/a.copy', 'plaintext', snapshotOf(BADGE), {} as never)?.id).toBe('root');
    expect(plugin.createVirtualCode?.('/p/a.fud', 'plaintext', snapshotOf(BADGE), {} as never)).toBeUndefined();
  });

  it('bumps the version on every update and forgets the file on dispose', () => {
    const { plugin, asked } = setup();
    const snapshot = snapshotOf(BADGE);
    const id = `file://${BADGE_PATH}`;

    const first = plugin.createVirtualCode?.(id, FUD_LANGUAGE_ID, snapshot, {} as never);
    plugin.updateVirtualCode?.(id, first!, snapshot, {} as never);
    plugin.disposeVirtualCode?.(id, first!);
    plugin.createVirtualCode?.(id, FUD_LANGUAGE_ID, snapshot, {} as never);

    expect(asked).toEqual([
      `get ${BADGE_PATH} v1`,
      `get ${BADGE_PATH} v2`,
      `invalidate ${BADGE_PATH}`,
      `get ${BADGE_PATH} v1`,
    ]);
  });

  it('tells TypeScript that .fud is mixed content, its script the client, the server an extra file', () => {
    const { plugin } = setup();
    const root = plugin.createVirtualCode?.(BADGE_PATH, FUD_LANGUAGE_ID, snapshotOf(BADGE), {} as never) as
      FudicVirtualCode;
    const typescript = plugin.typescript!;

    expect(typescript.extraFileExtensions).toEqual([{ extension: 'fud', isMixedContent: true, scriptKind: 7 }]);
    expect(typescript.getServiceScript(root as VirtualCode)).toEqual({
      code: root.client,
      extension: '.ts',
      scriptKind: 3,
    });
    expect(typescript.getExtraServiceScripts?.(BADGE_PATH, root as VirtualCode)).toEqual([
      { fileName: `${BADGE_PATH}.server.ts`, code: root.server, extension: '.ts', scriptKind: 3 },
    ]);
  });
});
