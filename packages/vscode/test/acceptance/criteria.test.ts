/**
 * The twelve criteria of SDD-25 §6, one by one.
 *
 * Organised by criterion rather than by module, so that the question "is this SDD done"
 * has a file that answers it. The other specs are organised by unit and are where a
 * regression is diagnosed; this one is where it is noticed.
 *
 * Six of the twelve need a running editor or an installed `.vsix` and cannot be asserted
 * here at all. They are named below with the reason, and each one has a numbered step in
 * `docs/verificacion-manual.md`. Naming them is the point: a suite that quietly covers half
 * the criteria and reports green is worse than one that says which half.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { activate } from '../../src/extension.js';
import { fixture, trailingScopes, tokenize, findExact, has } from '../_tokenize.js';
import { LanguageClient } from '../_languageclient-stub.js';
import { editorFor, reset, state } from '../_vscode-stub.js';
import type { ExtensionContext } from 'vscode';

const manifest = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8'),
) as Record<string, unknown>;

const context = (): ExtensionContext =>
  ({ extensionPath: '/ext', subscriptions: [] }) as unknown as ExtensionContext;

const run = async (id: string): Promise<void> => {
  await (state.commandHandlers.get(id) as (() => Promise<void>) | undefined)?.();
};

beforeEach(() => {
  reset();
  LanguageClient.reset();
});

describe('criterion 1 — the language is registered', () => {
  it('claims .fud with an icon for both themes', () => {
    const language = (manifest['contributes'] as { languages: unknown[] }).languages[0] as {
      id: string;
      extensions: string[];
      icon: Record<string, string>;
    };

    expect(language.id).toBe('fudic');
    expect(language.extensions).toEqual(['.fud']);
    expect(Object.keys(language.icon)).toEqual(['light', 'dark']);
  });
  // Whether VS Code then *shows* that icon is manual step 1.
});

describe('criterion 2 — colour in the first frame, without bleed', () => {
  it.each(['blog/[slug].fud', 'components/app-badge.fud'])(
    'colours %s and comes back to the base scope',
    async (name) => {
      const tokens = await tokenize(fixture(name));

      expect(tokens.some((token) => token.scopes.includes('source.ts'))).toBe(true);
      expect(await trailingScopes(fixture(name))).toEqual(['text.html.fudic']);
    },
  );

  it('keeps directives, markup and components distinguishable', async () => {
    const tokens = await tokenize(fixture('blog/[slug].fud'));

    expect(has(findExact(tokens, 'section'), 'keyword.control.directive')).toBe(true);
    expect(has(findExact(tokens, 'app-badge'), 'entity.name.tag.custom')).toBe(true);
    expect(has(findExact(tokens, 'article'), 'entity.name.tag')).toBe(true);
  });
});

// Criterion 3 (semantic tokens correcting TextMate) and criterion 4 (completion, hover,
// F12 and a real diagnostic over the workspace) need the server answering inside an
// editor. Nothing here can stand in for that: doubling the server would only assert that
// the double answers. Manual steps 2 and 3.

describe('criteria 5 and 6 — comment and folding, as far as data goes', () => {
  const languageConfig = JSON.parse(
    readFileSync(fileURLToPath(new URL('../../language-configuration.json', import.meta.url)), 'utf8'),
  ) as { comments: Record<string, unknown>; folding: { markers: Record<string, string> } };

  it('offers only the block comment', () => {
    expect(languageConfig.comments['blockComment']).toEqual(['@*', '*@']);
    expect(languageConfig.comments['lineComment']).toBeUndefined();
  });

  it('marks the directive blocks as foldable', () => {
    const start = new RegExp(languageConfig.folding.markers['start'] ?? '');

    for (const line of ['@code {', '  @server {', '@if (a) {', '@foreach (const p of ps) {']) {
      expect(start.test(line)).toBe(true);
    }
  });
  // Whether Ctrl+/ and the fold arrows behave is manual steps 4 and 5.
});

// Criterion 7 (a restart under three seconds after installing a dependency) is a timing
// claim about a real process. The wiring it depends on is asserted in commands.test.ts and
// activate.test.ts; the three seconds are manual step 6.

describe('criterion 8 — the virtual files command', () => {
  it('opens the three virtuals of a route, each in its own language', async () => {
    state.activeEditor = editorFor('fudic', 'file:///work/blog/[slug].fud');
    LanguageClient.answers['fudic/virtualFiles'] = [
      { fileName: 'blog/[slug].fud.ts', languageId: 'typescript', text: 'export {}' },
      { fileName: 'blog/[slug].fud.server.ts', languageId: 'typescript', text: 'export {}' },
      { fileName: 'blog/[slug].fud.0.css', languageId: 'css', text: ':host{}' },
    ];

    await activate(context());
    await run('fudic.showVirtualFiles');

    expect(state.openedDocuments).toHaveLength(3);
    expect(state.openedDocuments.map(([, language]) => language)).toEqual([
      'typescript',
      'typescript',
      'css',
    ]);
  });
});

describe('criterion 9 — degraded', () => {
  it('starts, warns once, and shows the degraded state', async () => {
    // No workspace folder and no TypeScript anywhere. HTML and CSS keep working because
    // they never depended on the server in the first place — that is TextMate.
    state.activeEditor = editorFor('fudic');

    await activate(context());

    expect(LanguageClient.created[0]?.started).toBe(1);
    expect(state.warnings).toHaveLength(1);
    expect(state.bar.text).toBe('Fudic ⚠');
  });
});

describe('criterion 10 — the server dies', () => {
  it('retries three times, shows ✕, and leaves the restart available', async () => {
    vi.useFakeTimers();
    state.activeEditor = editorFor('fudic');
    LanguageClient.failAllStarts = true;

    const activation = activate(context());
    await vi.runAllTimersAsync();
    await activation;
    vi.useRealTimers();

    expect(LanguageClient.created[0]?.started).toBe(3);
    expect(state.bar.text).toBe('Fudic ✕');
    expect(state.commandHandlers.has('fudic.restartServer')).toBe(true);
    expect(state.warnings.some((message) => message.includes('tres intentos'))).toBe(true);
  });
});

// Criterion 11 (a .vsix installed on a clean machine) is checked from two sides:
// `pnpm --filter fudic-vscode verify:vsix` asserts what is inside the package, and manual
// step 7 installs it. A unit test cannot install anything.

describe('criterion 12 — activation by workspace', () => {
  it('wakes on a workspace that merely contains a .fud', () => {
    // Without this the extension would only wake on opening a `.fud`, and a project entered
    // through a `.ts` would have no inter-file diagnostics until one was opened.
    expect(manifest['activationEvents']).toContain('workspaceContains:**/*.fud');
  });
  // That the diagnostics are then live is manual step 8.
});
