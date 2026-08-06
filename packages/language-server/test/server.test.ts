/**
 * The server, assembled (SDD-24 §3.2, §4.5, §4.6, §6.1, §6.13, §6.15).
 *
 * Driven through the handlers it registers, with Volar's pieces faked: what is being checked is
 * the wiring — which services run, what is scanned, when the index is invalidated, and what the
 * client is told — not Volar's routing, which is Volar's own test suite.
 */

import { describe, expect, it } from 'vitest';
import type { InitializeParams, LanguageServerProject } from '@volar/language-server/node';
import type * as ts from 'typescript';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { createFudicServer, type FudicServerDeps } from '../src/server.js';
import { GLOBALS_FILE_NAME } from '../src/globals.js';
import { COMPONENT_REGISTRY_REQUEST, VIRTUAL_FILES_REQUEST } from '../src/requests.js';
import { component, LAYOUT, memoryFs, route } from './_support.js';
import { fakeConnection, fakeVolarServer } from './_lsp.js';

const SLUG = '/p/blog/[slug].fud';
const SLUG_SOURCE = route('../layouts/_layout.fud', ['../components/app-badge.fud']);

const FILES: Record<string, string> = {
  '/p/components/app-badge.fud': component('app-badge'),
  '/p/layouts/_layout.fud': LAYOUT,
  [SLUG]: SLUG_SOURCE,
};

const TYPESCRIPT = { version: '5.9.3' } as unknown as typeof ts;

const params = (over: Partial<InitializeParams> = {}): InitializeParams =>
  ({
    processId: null,
    rootUri: null,
    capabilities: {},
    workspaceFolders: [{ uri: URI.file('/p').toString(), name: 'p' }],
    initializationOptions: { typescript: { tsdk: '/p/node_modules/typescript/lib' } },
    ...over,
  }) as InitializeParams;

/** A server whose Volar pieces are all fakes, over an in-memory workspace. */
function setup(over: Partial<FudicServerDeps> = {}, files: Record<string, string> = { ...FILES }) {
  const fake = fakeConnection();
  const documents = new Map<string, TextDocument>();
  const volar = fakeVolarServer(documents);
  const projects: { kind: string; value: unknown }[] = [];
  const setups: ((options: { project: unknown }) => void)[] = [];

  const server = createFudicServer(fake.connection, {
    createServer: () => volar,
    fileSystem: memoryFs(files),
    loadTypeScript: () => ({ typescript: TYPESCRIPT, origin: 'project' }),
    createTypeScriptProject: ((_ts: unknown, _messages: unknown, create: () => unknown) => {
      const created = create() as { setup?: (options: { project: unknown }) => void };
      if (created.setup) setups.push(created.setup);
      projects.push({ kind: 'typescript', value: created });
      return { kind: 'typescript' } as unknown as LanguageServerProject;
    }) as unknown as FudicServerDeps['createTypeScriptProject'],
    createSimpleProject: ((languagePlugins: unknown) => {
      projects.push({ kind: 'simple', value: languagePlugins });
      return { kind: 'simple' } as unknown as LanguageServerProject;
    }) as unknown as FudicServerDeps['createSimpleProject'],
    ...over,
  });

  return { fake, volar, server, projects, setups, documents, files };
}

describe('initialize', () => {
  it('scans the workspace folders it was opened on', () => {
    const { fake, server } = setup();
    fake.onInitialize?.(params());

    expect(server.index.all().map((entry) => entry.path)).toEqual([
      '/p/components/app-badge.fud',
      '/p/layouts/_layout.fud',
      SLUG,
    ]);
  });

  it('falls back to rootUri, and copes with a client that sends neither', () => {
    const withRoot = setup();
    withRoot.fake.onInitialize?.(
      params({ workspaceFolders: null, rootUri: URI.file('/p').toString() }),
    );
    expect(withRoot.server.index.all().length).toBe(3);

    const withNothing = setup();
    withNothing.fake.onInitialize?.(params({ workspaceFolders: null, rootUri: null }));
    expect(withNothing.server.index.all()).toEqual([]);
  });

  it('declares the capabilities of §3.2, whatever Volar computed', () => {
    const { fake } = setup();
    const result = fake.onInitialize?.(params());

    expect(result?.capabilities.completionProvider?.triggerCharacters).toEqual([
      '@',
      '<',
      '.',
      ':',
      '"',
      '/',
      '!',
      '}',
      '*',
      '$',
      ']',
      '>',
      '+',
      ')',
    ]);
    expect(result?.capabilities.diagnosticProvider).toEqual({
      interFileDependencies: true,
      workspaceDiagnostics: false,
    });
    // Volar's own answer is kept where §3.2 says nothing.
    expect(result?.capabilities.workspace?.workspaceFolders?.supported).toBe(true);
  });

  it('builds a TypeScript project and runs the services over it', () => {
    const { fake, projects, volar } = setup();
    fake.onInitialize?.(params());

    expect(projects.map((project) => project.kind)).toEqual(['typescript']);
    expect(volar.initializeCalls).toBe(1);
  });

  it('degrades to HTML and CSS when no TypeScript could be loaded (§6.1)', () => {
    const { fake, projects } = setup({ loadTypeScript: () => ({ origin: 'none' }) });
    fake.onInitialize?.(params());

    expect(projects.map((project) => project.kind)).toEqual(['simple']);
    expect(fake.errors).toContain('Degraded to HTML and CSS: no TypeScript could be loaded');
  });
});

describe('the ambient declarations', () => {
  const host = (files: readonly string[]): ts.LanguageServiceHost => ({
    getScriptFileNames: () => [...files],
    getScriptVersion: () => '1',
    getScriptSnapshot: () => undefined,
    getCompilationSettings: () => ({}),
    getCurrentDirectory: () => '/p',
    getDefaultLibFileName: () => 'lib.d.ts',
    fileExists: () => false,
    readFile: () => undefined,
  });

  it('are mounted in memory when the project does not ship them', () => {
    const { fake, setups } = setup();
    fake.onInitialize?.(params());
    const languageServiceHost = host([]);

    setups[0]?.({ project: { typescript: { languageServiceHost } } });

    expect(languageServiceHost.getScriptFileNames()).toContain(`/p/${GLOBALS_FILE_NAME}`);
    expect(fake.log).toContain('Mounted the fudic ambient declarations in memory');
  });

  it('are left alone when the project ships them on disk', () => {
    const { fake, setups } = setup();
    fake.onInitialize?.(params());

    setups[0]?.({
      project: { typescript: { languageServiceHost: host([`/p/${GLOBALS_FILE_NAME}`]) } },
    });

    expect(fake.log).toContain('The project ships fudic-globals.d.ts: using the file on disk');
  });

  it('mount under the working directory when the client opened no folder at all', () => {
    const { fake, setups } = setup();
    fake.onInitialize?.(params({ workspaceFolders: null, rootUri: null }));
    const languageServiceHost = host([]);

    setups[0]?.({ project: { typescript: { languageServiceHost } } });

    expect(
      languageServiceHost.getScriptFileNames().some((name) => name.endsWith(GLOBALS_FILE_NAME)),
    ).toBe(true);
  });

  it('do nothing at all when there is no TypeScript host to mount them into', () => {
    const { fake, setups } = setup();
    fake.onInitialize?.(params());

    setups[0]?.({ project: {} });

    expect(fake.log).toEqual([]);
  });
});

describe('the lifecycle', () => {
  it('forwards initialized and shutdown, and forgets every cached document (§4.6)', () => {
    const { fake, volar, server } = setup();
    fake.onInitialize?.(params());
    fake.onInitialized?.();

    const before = server.cache.get(SLUG, 1, SLUG_SOURCE);
    fake.onShutdown?.();

    expect(volar.shutdownCalls).toBe(1);
    expect(server.cache.get(SLUG, 1, SLUG_SOURCE)).not.toBe(before);
    expect(server.stats.completed).toBe(0);
  });
});

describe('watched files', () => {
  it('takes a new .fud without a restart (§6.13)', () => {
    const { fake, server, files } = setup();
    fake.onInitialize?.(params());

    files['/p/components/app-card.fud'] = component('app-card');
    fake.onDidChangeWatchedFiles?.({
      changes: [{ uri: URI.file('/p/components/app-card.fud').toString(), type: 1 }],
    });

    expect(server.index.resolve(SLUG, '../components/app-card.fud')?.tag).toBe('app-card');
  });

  it('drops a deleted one', () => {
    const { fake, server } = setup();
    fake.onInitialize?.(params());

    fake.onDidChangeWatchedFiles?.({
      changes: [{ uri: URI.file('/p/components/app-badge.fud').toString(), type: 3 }],
    });

    expect(server.index.get('/p/components/app-badge.fud')).toBeUndefined();
  });

  it('ignores a change to anything that is not a .fud', () => {
    const { fake, server } = setup();
    fake.onInitialize?.(params());
    const before = server.index.revision;

    fake.onDidChangeWatchedFiles?.({
      changes: [{ uri: URI.file('/p/tsconfig.json').toString(), type: 2 }],
    });

    expect(server.index.revision).toBe(before);
  });
});

describe('the own requests (§3.4)', () => {
  it('answers fudic/virtualFiles for an open document', async () => {
    const { fake, documents } = setup();
    fake.onInitialize?.(params());
    const uri = URI.file(SLUG).toString();
    documents.set(uri, TextDocument.create(uri, 'fud', 7, SLUG_SOURCE));

    const handler = fake.requests.get(VIRTUAL_FILES_REQUEST);
    const files = (await handler?.({ uri } as never)) as { fileName: string }[];

    expect(files.map((file) => file.fileName)).toEqual([
      `${SLUG}.ts`,
      `${SLUG}.server.ts`,
    ]);
  });

  it('answers for a file that is only on disk', async () => {
    const { fake } = setup();
    fake.onInitialize?.(params());

    const handler = fake.requests.get(COMPONENT_REGISTRY_REQUEST);
    const links = (await handler?.({ uri: URI.file(SLUG).toString() } as never)) as {
      tag: string;
    }[];

    expect(links.map((link) => link.tag)).toEqual(['app-badge', '']);
  });

  it('answers empty for a file that is nowhere', async () => {
    const { fake } = setup();
    fake.onInitialize?.(params());
    const uri = URI.file('/p/ghost.fud').toString();

    expect(await fake.requests.get(VIRTUAL_FILES_REQUEST)?.({ uri } as never)).toEqual([]);
    expect(await fake.requests.get(COMPONENT_REGISTRY_REQUEST)?.({ uri } as never)).toEqual([]);
  });
});

describe('the trace channel (§5)', () => {
  it('writes the cause of a failure next to its message', () => {
    const { fake } = setup({
      loadTypeScript: (_tsdk, _locale, logger) => {
        logger.error('something', new Error('because'));
        return { origin: 'none' };
      },
    });
    fake.onInitialize?.(params());

    expect(fake.errors).toContain('something: Error: because');
  });

  it('survives a channel that is already gone', () => {
    // A project can finish loading after the client disconnected, and then the console throws.
    // Both halves of the channel are exercised: whichever one is used, the failure to log is
    // not a failure of the server (§5).
    const { fake } = setup({
      loadTypeScript: (_tsdk, _locale, logger) => {
        logger.info('mounted something');
        logger.error('and then this');
        return { origin: 'none' };
      },
    });
    const disposed = new Error('Connection is disposed.');
    fake.disposeChannel(disposed);

    expect(() => fake.onInitialize?.(params())).not.toThrow();
    expect(fake.log).toEqual([]);
  });
});
