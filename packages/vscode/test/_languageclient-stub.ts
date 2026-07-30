/**
 * The double for `vscode-languageclient/node`.
 *
 * The real client spawns a process on `start()`. Under test that would mean an actual
 * server, an actual port and an actual race — and it would be testing Microsoft's client,
 * not this package's wiring. What is worth asserting is what the adapter *builds*: the id
 * that makes `fudic.trace.server` work, the transport, the document selector, the
 * initialization options. All of that is visible on the constructed instance.
 */

export const TransportKind = { stdio: 0, ipc: 1, pipe: 2, socket: 3 } as const;

export class LanguageClient {
  static readonly created: LanguageClient[] = [];
  /** Set by a test to make the next `start()` reject, as a failing server would. */
  static failNextStart = false;

  started = 0;
  stopped = 0;
  readonly requests: { method: string; params: unknown }[] = [];

  constructor(
    readonly id: string,
    readonly name: string,
    readonly serverOptions: unknown,
    readonly clientOptions: unknown,
  ) {
    LanguageClient.created.push(this);
  }

  static reset(): void {
    LanguageClient.created.length = 0;
    LanguageClient.failNextStart = false;
  }

  async start(): Promise<void> {
    this.started += 1;
    if (LanguageClient.failNextStart) {
      LanguageClient.failNextStart = false;
      throw new Error('server unavailable');
    }
  }

  async stop(): Promise<void> {
    this.stopped += 1;
  }

  async sendRequest<T>(method: string, params: unknown): Promise<T> {
    this.requests.push({ method, params });
    return undefined as T;
  }
}
