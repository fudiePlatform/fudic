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
import type { SpecFs } from '@fudic/spec';
import { commentSyntaxOf } from '@fudic/compiler';
import { CONFIG_FILE } from '@fudic/config';
import { create as createTypeScriptServices } from 'volar-service-typescript';
import { silenceLibraryFiles } from './services/read-only.js';
import { create as createHtmlService } from 'volar-service-html';
import { create as createCssService } from 'volar-service-css';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { SERVER_CAPABILITIES } from './capabilities.js';
import { mountGlobals, mountWorkspaceFuds, nodeFileSystem, toPosix } from '@fudic/typecheck';
import { DocumentCache, type CachedDocument } from './document-cache.js';
import { createFudspecLanguagePlugin } from './fudspec/language-plugin.js';
import { SpecHost } from './fudspec/host.js';
import { nodeSpecFs } from './fudspec/node-spec-fs.js';
import { createFudspecService } from './fudspec/service.js';
import { createFudicLanguagePlugin } from './language-plugin.js';
import { resolveOptions } from './options.js';
import { ProjectConfigs } from './project-config.js';
import {
  AUTO_CLOSE_TAG_REQUEST,
  autoCloseTagPayload,
  COMMENT_SYNTAX_REQUEST,
  commentSyntaxPayload,
  COMPONENT_REGISTRY_REQUEST,
  componentRegistryPayload,
  VIRTUAL_FILES_REQUEST,
  virtualFilesPayload,
} from './requests.js';
import { createFudicService, createFudicTagService } from './services/plugin.js';
import { silenceOwnedPositions } from './services/owned.js';
import { filterTypeScriptCompletions } from './services/ts-completion.js';
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
  /**
   * Asks every open document for its diagnostics again. Optional because only the `.fudspec`
   * service needs it: a term module changing on disk is not a document the editor has open.
   */
  languageFeatures?: { requestRefresh(clearDiagnostics: boolean): Promise<void> };
}

/** What the server is built out of. Every one has a real default. */
export interface FudicServerDeps {
  createServer(connection: Connection): VolarServer;
  loadTypeScript: typeof loadTypeScript;
  fileSystem: FileSystemScanner;
  /** Volar's TypeScript project factory. Injected so the `setup` hook can be driven in a test. */
  createTypeScriptProject: typeof createTypeScriptProject;
  createSimpleProject: typeof createSimpleProject;
  /** The disk the `.fudspec` validator reads term modules and fixtures from (SDD-52). */
  specFs: SpecFs;
  /** The framework's `terms/` folder, the second layer of a `.fudspec` vocabulary (SDD-52). */
  frameworkTerms?: string;
}

/** The state a running server holds. Exposed so the acceptance tests can look at it. */
export interface FudicServer {
  readonly index: WorkspaceIndex;
  readonly cache: DocumentCache;
  readonly stats: RequestStats;
  readonly configs: ProjectConfigs;
  /** What a `.fudspec` is validated against (SDD-52). */
  readonly specs: SpecHost;
}

const DEFAULTS: FudicServerDeps = {
  createServer: createVolarServer,
  loadTypeScript,
  fileSystem: nodeFileSystem(),
  createTypeScriptProject,
  createSimpleProject,
  specFs: nodeSpecFs(),
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
  const configs = new ProjectConfigs(deps.fileSystem);
  const cache = new DocumentCache(index);
  const stats = new RequestStats();
  const logger = loggerFor(connection);
  const server = deps.createServer(connection);
  let workspaceRoots: readonly string[] = [];
  const specs = new SpecHost({
    index,
    fs: deps.specFs,
    roots: () => workspaceRoots,
    ...(deps.frameworkTerms !== undefined ? { frameworkTerms: deps.frameworkTerms } : {}),
  });

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
    workspaceRoots = roots;
    for (const root of roots) {
      index.scan(root);
      // Who each folder is (SDD-41). One per workspace folder, and the editor uses it for
      // exactly one thing: the tag the `component` skeleton proposes.
      configs.scan(root);
    }

    const typescript = deps.loadTypeScript(options.tsdk, params.locale, logger);
    // The `.fudspec` plugin sits next to the `.fud` one and shares nothing with it (SDD-52).
    const languagePlugins = [createFudicLanguagePlugin(cache), createFudspecLanguagePlugin()];
    // Whether the decorator below will be mounted. The service needs to know: at a binding
    // value and at a `@` in markup both of them can produce the template's scope, and with
    // both speaking the developer sees every name twice.
    const withTypeScript = hasTypeScript(typescript);
    const plugins: LanguageServicePlugin[] = [
      // Ours goes first: where two services answer the same position — an `href`, a
      // `@section `, a `class:` — §4.1 gives this one the answer, and Volar asks them in order.
      createFudicService({ index, stats, typescript: withTypeScript, configs }),
      // The whole `.fud` is the HTML document: its markup is HTML with `@` in it, and the
      // native tags and attributes have to come from somewhere (§4.1, §6.4).
      //
      // Wrapped, because the root is the LAST document Volar walks and an empty list from
      // TypeScript does not claim a position: without this, HTML's vocabulary filled every
      // silence the projection left — which is what a `.` on a component actually offered
      // (BUG-23, TODO 1).
      silenceOwnedPositions(createHtmlService({ documentSelector: ['fud'] })),
      createCssService(),
      // The one position where this server ADDS instead of deciding: after a `<`, the workspace
      // components are a voice next to the native tags rather than in place of them. It is
      // additional, so it neither claims the position nor is silenced by the service above it
      // (BUG-15 §4.6).
      // It also answers inside attribute values, and there the `styles` of the project's
      // fudic.json are what the root template's `shadowrootadoptedstylesheets` chooses from.
      createFudicTagService({ index, stats, configs }),
      // Criteria files: a service of their own, which answers only in a `.fudspec` (SDD-52).
      createFudspecService({ host: specs, stats }),
    ];

    // Nothing speaks over a library's file (SDD-43 §4.4): read-only means every service,
    // not only ours, because a file underlined by TypeScript is underlined all the same.
    const readOnly = (list: LanguageServicePlugin[]): LanguageServicePlugin[] =>
      silenceLibraryFiles(list, index);

    let project: LanguageServerProject;
    if (withTypeScript) {
      // Wrapped, never raw: inside a `.fud` two of TypeScript's own lists are correct
      // TypeScript and wrong answers — the reserved `$` scaffolding, and the global scope
      // it falls back to when a component's contract has no members (BUG-23, TODOs 1, 4).
      plugins.unshift(
        ...filterTypeScriptCompletions(createTypeScriptServices(typescript.typescript)),
      );
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
                : "The project has a fudic-globals.d.ts: overriding it with this server's, which is the one the projection is written against",
            );
            // Without this a component nobody opened is not in the program, so the
            // `import type … from './app-input.fud'` a page projects resolves to nothing and
            // its contract degrades to `any` — no prop checking, no required checking, and a
            // `.` that answers with the global scope (BUG-23).
            const fuds = mountWorkspaceFuds(host, index);
            logger.info(`Added ${fuds} .fud file(s) of the workspace to the TypeScript program`);
          },
        }),
      );
    } else {
      // §6.1: no TypeScript at all. HTML and CSS still work, and the file keeps its colour.
      logger.error('Degraded to HTML and CSS: no TypeScript could be loaded');
      project = deps.createSimpleProject(languagePlugins);
    }

    const result = server.initialize(params, project, readOnly(plugins));
    // §3.2 is a contract with the client, so it is declared rather than inferred from whichever
    // plugins happened to load: with no TypeScript the list must still say what a `.fud` supports.
    //
    // Written INTO Volar's own object, never into a copy. Volar encodes every semantic token
    // against `capabilities.semanticTokensProvider.legend`, read off this very object at request
    // time; a copy told the editor one order of token types while the tokens were numbered in
    // another, and every standard type came out as its neighbour — a variable painted as a
    // parameter, the name of a `@render` as an enum member. Our own `fud…` types lined up only
    // by accident of position.
    Object.assign(result.capabilities, SERVER_CAPABILITIES);
    return result;
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
    // Whether an open `.fudspec` may now say something else: a term module, a fixture or a
    // component changed. Asked once for the whole batch.
    let criteria = false;
    for (const change of changes) {
      const path = uriToPath(URI.parse(change.uri));
      if (SpecHost.affects(path)) criteria = true;
      // The same channel that keeps the index current keeps the project current: editing
      // `fudic.json` and saving changes what the next file's snippet proposes, with no
      // restart. A new channel for one file would be a second thing that can fall behind.
      if (path.endsWith(`/${CONFIG_FILE}`)) {
        configs.invalidate(path);
        continue;
      }
      if (!path.endsWith('.fud')) continue;

      // 3 is `FileChangeType.Deleted`. A deletion drops the entry; anything else re-reads it,
      // and per file — never the whole index (§4.5).
      if (change.type === 3) index.remove(path);
      else index.upsert(path);
      cache.invalidate(path);
    }
    if (criteria) {
      specs.invalidate();
      void server.languageFeatures?.requestRefresh(false);
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

  connection.onRequest(
    AUTO_CLOSE_TAG_REQUEST,
    ({ uri, offset }: { uri: string; offset: number }) => {
      const document = documentOf(uri);
      return document === undefined ? '' : autoCloseTagPayload(document, offset);
    },
  );

  connection.onRequest(
    COMMENT_SYNTAX_REQUEST,
    ({ uri, offset }: { uri: string; offset: number }) => {
      const document = documentOf(uri);
      // A file the server cannot see is markup as far as this is concerned: it is what an
      // empty `.fud` is, and answering nothing would leave the editor with no way to comment.
      return document === undefined
        ? commentSyntaxOf('markup')
        : commentSyntaxPayload(document, offset);
    },
  );

  return { index, cache, stats, configs, specs };
}
