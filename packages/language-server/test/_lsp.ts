/**
 * Fakes for the two frameworks the server sits on: the LSP connection and Volar's context.
 *
 * They are hand-written rather than mocked so that what the server is allowed to use stays
 * visible — `VolarServer` is narrow precisely so that its fake is a few lines.
 */

import type { Connection, InitializeResult } from '@volar/language-server/node';
import type { LanguageServiceContext } from '@volar/language-service';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { CancellationToken } from 'vscode-languageserver-protocol';
import type { URI } from 'vscode-uri';
import type { VolarServer } from '../src/server.js';
import { createFudicVirtualCode } from '../src/virtual-code.js';
import type { CachedDocument } from '../src/document-cache.js';

/** A cancellation token that is already spent, or never will be. */
export const TOKEN: CancellationToken = {
  isCancellationRequested: false,
  onCancellationRequested: () => ({ dispose: () => undefined }),
};

export const CANCELLED: CancellationToken = { ...TOKEN, isCancellationRequested: true };

/** The handlers a server registered on its connection, plus the log it wrote. */
export interface FakeConnection {
  readonly connection: Connection;
  readonly log: string[];
  readonly errors: string[];
  onInitialize?: (params: unknown) => InitializeResult;
  onInitialized?: () => void;
  onShutdown?: () => void;
  onDidChangeWatchedFiles?: (params: { changes: { uri: string; type: number }[] }) => void;
  readonly requests: Map<string, (params: never) => unknown>;
  listened: boolean;
}

/** A connection that records instead of talking to anybody. */
export function fakeConnection(): FakeConnection {
  const fake: FakeConnection = {
    connection: undefined as unknown as Connection,
    log: [],
    errors: [],
    requests: new Map(),
    listened: false,
  };

  const connection = {
    console: {
      log: (message: string) => fake.log.push(message),
      error: (message: string) => fake.errors.push(message),
    },
    onInitialize: (handler: (params: unknown) => InitializeResult) => {
      fake.onInitialize = handler;
    },
    onInitialized: (handler: () => void) => {
      fake.onInitialized = handler;
    },
    onShutdown: (handler: () => void) => {
      fake.onShutdown = handler;
    },
    onDidChangeWatchedFiles: (
      handler: (params: { changes: { uri: string; type: number }[] }) => void,
    ) => {
      fake.onDidChangeWatchedFiles = handler;
    },
    onRequest: (method: string, handler: (params: never) => unknown) => {
      fake.requests.set(method, handler);
    },
    listen: () => {
      fake.listened = true;
    },
  };

  return Object.assign(fake, { connection: connection as unknown as Connection });
}

/** Volar's server, reduced to what `createFudicServer` drives. */
export function fakeVolarServer(documents: Map<string, TextDocument> = new Map()): VolarServer & {
  initializeCalls: number;
  shutdownCalls: number;
} {
  return {
    initializeCalls: 0,
    shutdownCalls: 0,
    initialize(): InitializeResult {
      this.initializeCalls++;
      return { capabilities: { workspace: { workspaceFolders: { supported: true } } } };
    },
    initialized: () => undefined,
    shutdown(): void {
      this.shutdownCalls++;
    },
    documents: { get: (uri: URI) => documents.get(uri.toString()) },
  };
}

/**
 * A Volar service context holding exactly one document.
 *
 * The real context carries a whole language; a service only ever reaches for the root virtual
 * code of the document it was asked about, which is what this provides.
 */
export function fakeServiceContext(
  documents: Readonly<Record<string, CachedDocument>>,
): LanguageServiceContext {
  return {
    language: {
      scripts: {
        get: (uri: URI) => {
          const cached = documents[uri.toString()];
          return cached === undefined
            ? undefined
            : { generated: { root: createFudicVirtualCode(cached) } };
        },
      },
    },
  } as unknown as LanguageServiceContext;
}
