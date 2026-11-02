/**
 * The commands of a `.fudapi` (SDD-75 §3.3): what its line 1 lenses run, and the palette with one
 * active. Each takes the file's URI from the lens, or the active `.fudapi` from the palette.
 *
 * The modules of each side are views of text that exists nowhere on disk, so they are kept by name
 * and asked for again when their `.fudapi` is saved: an open one shows what it generates now.
 */

import type { CommandDeps } from './deps.js';
import { NO_ACTIVE_FUDAPI, SERVER_DOWN, requestFailed } from './messages.js';
import type { LspRange } from '../ports.js';

export const API_COMMAND_IDS = {
  showTypes: 'fudic.api.showTypes',
  showServer: 'fudic.api.showServer',
  showBrowser: 'fudic.api.showBrowser',
  regenerate: 'fudic.api.regenerate',
  goToImplementation: 'fudic.api.goToImplementation',
} as const;

/** Spelled here rather than imported, like every request name: the wire is the contract. */
export const API_TYPES_REQUEST = 'fudic/apiTypes';
export const API_MODULE_REQUEST = 'fudic/apiModule';
export const API_REGENERATE_REQUEST = 'fudic/apiRegenerate';

type Side = 'server' | 'browser';
type ModuleAnswer = { readonly name: string; readonly text: string } | { readonly problem: string };

export class ApiCommands {
  readonly #deps: CommandDeps;
  /** The module views open, by name: which file and which side they show. */
  readonly #views = new Map<string, { readonly uri: string; readonly side: Side }>();

  constructor(deps: CommandDeps) {
    this.#deps = deps;
  }

  /** The five handlers, by command id. */
  handlers(): Readonly<Record<string, (...args: readonly unknown[]) => Promise<void>>> {
    return {
      [API_COMMAND_IDS.showTypes]: (uri) => this.#showTypes(uri),
      [API_COMMAND_IDS.showServer]: (uri) => this.#showModule('server', uri),
      [API_COMMAND_IDS.showBrowser]: (uri) => this.#showModule('browser', uri),
      [API_COMMAND_IDS.regenerate]: (uri) => this.#regenerate(uri),
      [API_COMMAND_IDS.goToImplementation]: (file, range) => this.#deps.documents.openFile(file as string, range as LspRange),
    };
  }

  /** The `.fudapi` at `uri` was saved: its open module views show what it generates now. */
  async refresh(uri: string): Promise<void> {
    for (const [name, view] of this.#views) {
      if (view.uri !== uri) continue;
      const answer = await this.#request<ModuleAnswer>(API_MODULE_REQUEST, { uri, side: view.side });
      if (answer !== undefined && 'text' in answer) this.#deps.documents.updateReadOnly(name, answer.text);
    }
  }

  async #showTypes(uri: unknown): Promise<void> {
    const target = this.#target(uri);
    if (target === undefined) return;
    const answer = await this.#request<{ readonly path: string }>(API_TYPES_REQUEST, { uri: target });
    if (answer !== undefined) await this.#deps.documents.openFile(answer.path);
  }

  async #showModule(side: Side, uri: unknown): Promise<void> {
    const target = this.#target(uri);
    if (target === undefined) return;
    const answer = await this.#request<ModuleAnswer>(API_MODULE_REQUEST, { uri: target, side });
    if (answer === undefined) return;
    if ('problem' in answer) {
      this.#deps.notifications.warn(answer.problem);
      return;
    }
    this.#views.set(answer.name, { uri: target, side });
    await this.#deps.documents.openReadOnly(answer.name, 'typescript', answer.text);
  }

  async #regenerate(uri: unknown): Promise<void> {
    const target = this.#target(uri);
    if (target === undefined) return;
    const answer = await this.#request<{ readonly count: number }>(API_REGENERATE_REQUEST, { uri: target });
    if (answer !== undefined) this.#deps.notifications.info(`Regenerated ${answer.count} ${answer.count === 1 ? 'file' : 'files'}.`);
  }

  /** The URI a lens passed, or the active `.fudapi`'s; `undefined`, said, when there is none or no server. */
  #target(uri: unknown): string | undefined {
    const target = typeof uri === 'string' ? uri : this.#deps.editor.activeFudapiUri();
    const problem = target === undefined ? NO_ACTIVE_FUDAPI : this.#deps.session.running ? undefined : SERVER_DOWN;
    if (problem !== undefined) this.#deps.notifications.warn(problem);
    return problem === undefined ? target : undefined;
  }

  /** A request to the server; `undefined`, said, when it dies on the way. */
  async #request<T>(method: string, params: unknown): Promise<T | undefined> {
    try {
      return await this.#deps.session.client.sendRequest<T>(method, params);
    } catch (error) {
      this.#deps.notifications.warn(requestFailed(method, error));
      return undefined;
    }
  }
}
