/**
 * The server, assembled (SDD-24 §3.2, §4.5, §4.6).
 *
 * Everything before this file is a piece; this is where they become a process. Volar owns the
 * request routing, the TypeScript project and the document store; what is decided here is which
 * services run, what the workspace index is built from, when it is invalidated, and what the
 * client is told the server can do.
 *
 * The pieces Volar needs are injectable so the wiring itself can be tested in process. The
 * defaults are the real ones — a test that never exercises them is a test of something else.
 */

import {
  createServer as createVolarServer,
  createSimpleProject,
  createTypeScriptProject,
  type Connection,
  type InitializeParams,
  type InitializeResult,
  type LanguageServerProject,
} from '@volar/language-server/node.js';
import type { LanguageServicePlugin } from '@volar/language-service';
import { create as createTypeScriptServices } from 'volar-service-typescript';
import { create as createHtmlService } from 'volar-service-html';
import { create as createCssService } from 'volar-service-css';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { SERVER_CAPABILITIES } from './capabilities.js';
import { DocumentCache, type CachedDocument } from './document-cache.js';
import { mountGlobals } from './globals.js';
import { createFudicLanguagePlugin } from './language-plugin.js';
import { nodeFileSystem } from './node-fs.js';
import { resolveOptions } from './options.js';
import { toPosix } from './paths.js';
import {
  COMPONENT_REGISTRY_REQUEST,
  componentRegistryPayload,
  VIRTUAL_FILES_REQUEST,
  virtualFilesPayload,
} from './requests.js';
import { createFudicService, createFudicTagService } from './services/plugin.js';
import { RequestStats } from './stats.js';
import { hasTypeScript, loadTypeScript } from './tsdk.js';
import type { FileSystemScanner, Logger } from './types.js';
import { uriToPath } from './uri.js';
import { WorkspaceIndex } from './workspace-index.js';

/** The slice of Volar's server this file drives. Narrow on purpose: a fake of it is three lines. */
export interface VolarServer {
  initialize(
    params: InitializeParams,
    project: LanguageServerProject,
    plugins: LanguageServicePlugin[],
  ): InitializeResult;
  initialized(): void;
  shutdown(): void;
  documents: { get(uri: URI): TextDocument | undefined };
}

/** What the server is built out of. Every one has a real default. */
export interface FudicServerDeps {
  createServer(connection: Connection): VolarServer;
  loadTypeScript: typeof loadTypeScript;
  fileSystem: FileSystemScanner;
  /** Volar's TypeScript project factory. Injected so the `setup` hook can be driven in a test. */
  createTypeScriptProject: typeof createTypeScriptProject;
  createSimpleProject: typeof createSimpleProject;
}

/** The state a running server holds. Exposed so the acceptance tests can look at it. */
export interface FudicServer {
  readonly index: WorkspaceIndex;
  readonly cache: DocumentCache;
  readonly stats: RequestStats;
}

const DEFAULTS: FudicServerDeps = {
  createServer: createVolarServer,
  loadTypeScript,
  fileSystem: nodeFileSystem(),
  createTypeScriptProject,
  createSimpleProject,
};

/**
 * The trace channel of §5: everything swallowed ends up in the client's log.
 *
 * A write to it may fail, and the failure is not the server's business: a TypeScript project
 * finishes loading after the editor disconnected, the channel is gone, and the message it wanted
 * to log takes the process down with it. §5 says a request never throws; the log even less so.
 */
function loggerFor(connection: Connection): Logger {
  const write = (channel: (message: string) => void, message: string): void => {
    try {
      channel(message);
    } catch {
      // Nowhere left to report to — reporting THAT is what would be absurd.
    }
  };

  return {
    info: (message) => write((text) => connection.console.log(text), message),
    error: (message, cause) =>
      write(
        (text) => connection.console.error(text),
        cause === undefined ? message : `${message}: ${String(cause)}`,
      ),
  };
}

/** The folders this server was opened on, as paths. */
function rootsOf(params: InitializeParams): readonly string[] {
  const folders = params.workspaceFolders?.map((folder) => uriToPath(URI.parse(folder.uri))) ?? [];
  if (folders.length > 0) return folders;
  // A client that only sent `rootUri` (or nothing) is still a workspace of one folder.
  return params.rootUri === null || params.rootUri === undefined
    ? []
    : [uriToPath(URI.parse(params.rootUri))];
}

/** Wire a connection into a fudic language server. */
export function createFudicServer(
  connection: Connection,
  overrides: Partial<FudicServerDeps> = {},
): FudicServer {
  const deps: FudicServerDeps = { ...DEFAULTS, ...overrides };
  const index = new WorkspaceIndex(deps.fileSystem);
  const cache = new DocumentCache(index);
  const stats = new RequestStats();
  const logger = loggerFor(connection);
  const server = deps.createServer(connection);

  /** The parse behind a URI: the open document if there is one, the disk otherwise. */
  const documentOf = (raw: string): CachedDocument | undefined => {
    const uri = URI.parse(raw);
    const path = uriToPath(uri);
    const open = server.documents.get(uri);
    if (open !== undefined) return cache.get(path, open.version, open.getText());

    const source = deps.fileSystem.readFile(path);
    // Version 0: a file read from disk has no editor version, and it is not being edited.
    return source === undefined ? undefined : cache.get(path, 0, source);
  };

  connection.onInitialize((params) => {
    const options = resolveOptions(params.initializationOptions);
    const roots = rootsOf(params);
    for (const root of roots) index.scan(root);

    const typescript = deps.loadTypeScript(options.tsdk, params.locale, logger);
    const languagePlugins = [createFudicLanguagePlugin(cache)];
    const plugins: LanguageServicePlugin[] = [
      // Ours goes first: where two services answer the same position — an `href`, a
      // `@section `, a `class:` — §4.1 gives this one the answer, and Volar asks them in order.
      createFudicService({ index, stats }),
      // The whole `.fud` is the HTML document: its markup is HTML with `@` in it, and the
      // native tags and attributes have to come from somewhere (§4.1, §6.4).
      createHtmlService({ documentSelector: ['fud'] }),
      createCssService(),
      // The one position where this server ADDS instead of deciding: after a `<`, the workspace
      // components are a voice next to the native tags rather than in place of them. It is
      // additional, so it neither claims the position nor is silenced by the service above it
      // (BUG-15 §4.6).
      createFudicTagService({ index, stats }),
    ];

    let project: LanguageServerProject;
    if (hasTypeScript(typescript)) {
      plugins.unshift(...createTypeScriptServices(typescript.typescript));
      project = deps.createTypeScriptProject(
        typescript.typescript,
        typescript.diagnosticMessages,
        () => ({
          languagePlugins,
          setup({ project: context }) {
            const host = context.typescript?.languageServiceHost;
            if (host === undefined) return;
            const mounted = mountGlobals(host, roots[0] ?? toPosix(process.cwd()));
            logger.info(
              mounted
                ? 'Mounted the fudic ambient declarations in memory'
                : 'The project ships fudic-globals.d.ts: using the file on disk',
            );
          },
        }),
      );
    } else {
      // §6.1: no TypeScript at all. HTML and CSS still work, and the file keeps its colour.
      logger.error('Degraded to HTML and CSS: no TypeScript could be loaded');
      project = deps.createSimpleProject(languagePlugins);
    }

    const result = server.initialize(params, project, plugins);
    // §3.2 is a contract with the client, so it is declared rather than inferred from whichever
    // plugins happened to load: with no TypeScript the list must still say what a `.fud` supports.
    return { ...result, capabilities: { ...result.capabilities, ...SERVER_CAPABILITIES } };
  });

  connection.onInitialized(() => {
    server.initialized();
  });

  connection.onShutdown(() => {
    // §4.6: no state survives a restart, and there is none on disk to survive.
    cache.clear();
    stats.reset();
    server.shutdown();
  });

  connection.onDidChangeWatchedFiles(({ changes }) => {
    for (const change of changes) {
      const path = uriToPath(URI.parse(change.uri));
      if (!path.endsWith('.fud')) continue;

      // 3 is `FileChangeType.Deleted`. A deletion drops the entry; anything else re-reads it,
      // and per file — never the whole index (§4.5).
      if (change.type === 3) index.remove(path);
      else index.upsert(path);
      cache.invalidate(path);
    }
  });

  connection.onRequest(VIRTUAL_FILES_REQUEST, ({ uri }: { uri: string }) => {
    const document = documentOf(uri);
    return document === undefined ? [] : virtualFilesPayload(document);
  });

  connection.onRequest(COMPONENT_REGISTRY_REQUEST, ({ uri }: { uri: string }) => {
    const document = documentOf(uri);
    return document === undefined ? [] : componentRegistryPayload(document, index);
  });

  return { index, cache, stats };
}
