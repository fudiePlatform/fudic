/**
 * A real LSP round trip, in process (SDD-24 §6).
 *
 * The criteria of §6 are about what an editor sees, so nothing here is faked: a real connection
 * over a pair of pipes, the real Volar server, the real TypeScript of this workspace, and the
 * fixture project on disk. The only thing missing compared to VS Code is the editor.
 *
 * In process rather than as a child process on purpose — the coverage of a spawned server is not
 * collected by v8, and a server nobody measures is a server nobody keeps at 100%.
 */

import { vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { cpSync, mkdtempSync, readFileSync } from 'node:fs';
import {
  createConnection,
  StreamMessageReader as ServerReader,
  StreamMessageWriter as ServerWriter,
} from 'vscode-languageserver/node';
import {
  createProtocolConnection,
  DidChangeTextDocumentNotification,
  DidOpenTextDocumentNotification,
  DocumentDiagnosticRequest,
  ExitNotification,
  InitializedNotification,
  InitializeRequest,
  ShutdownRequest,
  StreamMessageReader as ClientReader,
  StreamMessageWriter as ClientWriter,
  type InitializeResult,
  type ProtocolConnection,
} from 'vscode-languageserver-protocol/node';
import { URI } from 'vscode-uri';
import { createFudicServer, type FudicServer } from '../../src/server.js';
import { toPosix } from '../../src/paths.js';
import { FIXTURES } from '../_support.js';

// These are integration tests, and the default five seconds are a unit test's budget: a request
// here can build or update a real TypeScript program, and the whole workspace runs its packages
// in parallel. Set here rather than in `vitest.config.ts` so it applies to exactly the files that
// talk to a live server — a unit test that hangs must still fail fast.
vi.setConfig({ testTimeout: 30_000 });

/**
 * The id a real editor sends in `didOpen` — VS Code's, which is the only client that exists.
 *
 * Deliberately NOT the server's own `FUD_LANGUAGE_ID`. An editor registers `.fud` under a name
 * of its choosing (`fudic`, per SDD-25 §3.1) and Volar passes that name straight through, so a
 * harness that sends `fud` is a harness that exercises a client nobody ships. That gap once hid
 * a server that answered every request with nothing when driven from VS Code.
 */
const EDITOR_LANGUAGE_ID = 'fudic';

/** The `tsdk` of this very workspace: the server must typecheck with the project's TypeScript. */
export const TSDK = dirname(createRequire(import.meta.url).resolve('typescript'));

/** URI of a fixture file. */
export const fixtureUri = (relative: string): string =>
  URI.file(`${FIXTURES}/${relative}`).toString();

/** Source of a fixture file, as it is on disk. */
export const fixtureText = (relative: string): string =>
  readFileSync(`${FIXTURES}/${relative}`, 'utf8');

/**
 * A private copy of the fixture workspace, for the tests that WRITE to it.
 *
 * `.fud` files that appear and disappear are the subject of §6.13, and the test files run in
 * parallel: a component created here would be indexed by the servers of the other files, whose
 * assertions are about a workspace of exactly four documents.
 */
export function copyWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), 'fudic-lsp-'));
  cpSync(FIXTURES, root, { recursive: true });
  return toPosix(root);
}

/** A client talking to a live server, plus the server's own state. */
export interface Harness {
  readonly client: ProtocolConnection;
  readonly server: FudicServer;
  readonly capabilities: InitializeResult;
  /** Tell the server about a document, at version 1. */
  open(relative: string, text?: string): Promise<{ uri: string; text: string }>;
  /** Replace a document's text, at a new version. */
  change(uri: string, text: string, version: number): Promise<void>;
  /** LSP position of an offset in `text`. */
  positionAt(text: string, offset: number): { line: number; character: number };
  /** The position of `|` in `marked`, and the text without it. */
  cursor(marked: string): { text: string; position: { line: number; character: number } };
  /** The workspace this server was opened on, and the URI of a file inside it. */
  readonly root: string;
  uriOf(relative: string): string;
  /**
   * Stop the server from reading, so a burst of messages arrives all at once.
   *
   * This is how §6.14 is measured without a clock: what makes a request cancellable is that it
   * is still unread when the cancellation arrives, and typing fast is exactly that. Holding the
   * pipe makes it certain instead of likely.
   */
  pause(): void;
  /**
   * Release the held bytes, optionally waiting until `frames` messages have been held.
   *
   * The count is what makes the burst a measurement instead of a race. `sendRequest` and
   * `token.cancel()` return before their bytes reach the pipe, so resuming right after issuing
   * them releases whatever happened to have arrived — which on a loaded machine is not the whole
   * burst. Waiting for the frames waits for an EVENT, not for a duration: there is still no
   * clock in §6.14.
   */
  resume(frames?: number): Promise<void>;
  stop(): Promise<void>;
}

/** Start a server and a client wired to each other. */
export async function startHarness(
  options: { tsdk?: string; root?: string } = {},
): Promise<Harness> {
  // The shared fixtures by default; a private copy for the tests that write files into it.
  const root = options.root ?? FIXTURES;
  const workspaceUri = URI.file(root);
  const uriOf = (relative: string): string => URI.file(`${root}/${relative}`).toString();
  const textOf = (relative: string): string => readFileSync(`${root}/${relative}`, 'utf8');

  // Two hops towards the server, so that a held burst can be delivered as ONE chunk.
  // Pausing the server's own pipe is not enough: a paused stream releases what it buffered
  // one write at a time, and the reader may dispatch a request before it has read the
  // cancellation that follows it in the same burst — which turns §6.14 into a measurement of
  // how busy the machine was. Holding the bytes here and writing them concatenated makes the
  // whole burst arrive in a single read, which is what "unread when the cancellation arrives"
  // means.
  const fromClient = new PassThrough();
  const toServer = new PassThrough();
  const toClient = new PassThrough();

  let held: Buffer[] | undefined;
  let waiting: { readonly frames: number; readonly resolve: () => void } | undefined;

  // How many JSON-RPC messages are held. Counted by their header, which is the only part of the
  // framing that is fixed: a body could in principle contain the string, but these bodies are
  // `.fud` sources and LSP positions, and none of them does.
  const framesHeld = (chunks: readonly Buffer[]): number =>
    Buffer.concat(chunks).toString('utf8').split('Content-Length:').length - 1;

  fromClient.on('data', (chunk: Buffer) => {
    if (held === undefined) {
      toServer.write(chunk);
      return;
    }
    held.push(chunk);
    if (waiting !== undefined && framesHeld(held) >= waiting.frames) {
      const { resolve } = waiting;
      waiting = undefined;
      resolve();
    }
  });

  const serverConnection = createConnection(
    new ServerReader(toServer),
    new ServerWriter(toClient),
  );
  const server = createFudicServer(serverConnection);
  serverConnection.listen();

  const client = createProtocolConnection(new ClientReader(toClient), new ClientWriter(fromClient));
  client.listen();

  const capabilities = await client.sendRequest(InitializeRequest.type, {
    processId: process.pid,
    rootUri: workspaceUri.toString(),
    workspaceFolders: [{ uri: workspaceUri.toString(), name: 'fixtures' }],
    capabilities: {
      textDocument: {
        synchronization: { dynamicRegistration: false },
        // What VS Code declares, and it has to match: with `snippetSupport: false` the
        // protocol layer downgrades every snippet to plain text, so a `.fud` skeleton would
        // arrive here as a wall of `${1:…}` and this harness would be testing a client
        // nobody uses (SDD-28).
        completion: { completionItem: { snippetSupport: true, labelDetailsSupport: true } },
        diagnostic: {},
        semanticTokens: {
          requests: { full: true },
          tokenTypes: [],
          tokenModifiers: [],
          formats: ['relative'],
        },
      },
      workspace: { workspaceFolders: true },
    },
    initializationOptions: { typescript: { tsdk: options.tsdk ?? TSDK } },
  });
  await client.sendNotification(InitializedNotification.type, {});

  const positionAt = (text: string, offset: number) => {
    const before = text.slice(0, offset);
    const line = before.split('\n').length - 1;
    const lastBreak = before.lastIndexOf('\n');
    return { line, character: offset - lastBreak - 1 };
  };

  // The first request against a workspace is the one that builds the TypeScript program, and it
  // costs seconds where every later one costs milliseconds. Paying for it here, inside the
  // generous timeout of a `beforeAll`, is what keeps the tests measuring features instead of
  // measuring a cold start — and it is also what a real editor does while the file opens.
  await client.sendNotification(DidOpenTextDocumentNotification.type, {
    textDocument: {
      uri: uriOf('layouts/_layout.fud'),
      languageId: EDITOR_LANGUAGE_ID,
      version: 1,
      text: textOf('layouts/_layout.fud'),
    },
  });
  await client.sendRequest(DocumentDiagnosticRequest.type, {
    textDocument: { uri: uriOf('layouts/_layout.fud') },
  });

  return {
    client,
    server,
    capabilities,
    positionAt,
    root,
    uriOf,

    pause() {
      held = [];
    },

    async resume(frames?: number) {
      if (frames !== undefined && held !== undefined && framesHeld(held) < frames) {
        await new Promise<void>((resolve) => {
          waiting = { frames, resolve };
        });
      }
      const pending = held ?? [];
      held = undefined;
      if (pending.length > 0) toServer.write(Buffer.concat(pending));
    },

    async open(relative, text) {
      const uri = uriOf(relative);
      const source = text ?? textOf(relative);
      // Awaited: the notification has to be on the wire before the request that reads it, or
      // the server answers about the version it had a moment ago.
      await client.sendNotification(DidOpenTextDocumentNotification.type, {
        textDocument: { uri, languageId: EDITOR_LANGUAGE_ID, version: 1, text: source },
      });
      return { uri, text: source };
    },

    async change(uri, text, version) {
      await client.sendNotification(DidChangeTextDocumentNotification.type, {
        textDocument: { uri, version },
        contentChanges: [{ text }],
      });
    },

    cursor(marked) {
      const offset = marked.indexOf('|');
      const text = marked.replace('|', '');
      return { text, position: positionAt(text, offset) };
    },

    async stop() {
      await client.sendRequest(ShutdownRequest.type, undefined);
      await client.sendNotification(ExitNotification.type);
      // Only the client side is torn down, and the pipes are left open on purpose.
      //
      // `interFileDependencies: true` (§3.2) puts Volar in the PUSH model as well as the pull
      // one: every edit schedules a diagnostics batch 250 ms later, per open document. Those
      // batches outlive the test, and a server writing into a connection somebody disposed is
      // an unhandled rejection — a teardown detail masquerading as a server defect. Leaving the
      // channel alive lets the late writes land in a pipe nobody reads, which is what they are.
      await new Promise((resolve) => setImmediate(resolve));
      client.dispose();
    },
  };
}
