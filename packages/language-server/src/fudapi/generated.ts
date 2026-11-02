/**
 * What a `.fudapi` generates, as the editor shows it (SDD-75 §3.2, §4.3): the module of each side,
 * from the text the editor has, and from the last text that had no errors while it has some.
 *
 * Every diagnostic pass goes through `check`, so the last good text is the last one the editor
 * saw clean, not the last one somebody happened to open the module of.
 */

import { emitModule, validateApi, type Side } from '@fudic/api';
import type { SourceDiagnostic } from '@fudic/diagnostics';
import type { ApiHost, ApiProject } from './host.js';

/** `{ uri }` → `{ path }`: the types of a `.fudapi`, written first if they are not there. */
export const API_TYPES_REQUEST = 'fudic/apiTypes';
/** `{ uri, side }` → `{ name, text }` or `{ problem }`: the module of one side. */
export const API_MODULE_REQUEST = 'fudic/apiModule';
/** `{ uri }` → `{ count }`: its types and its dependents', written again. */
export const API_REGENERATE_REQUEST = 'fudic/apiRegenerate';

/** What the module of a file that was never clean says. */
export const NOTHING_GENERATED = 'This file has errors; nothing has been generated yet.';

export type ModuleAnswer = { readonly name: string; readonly text: string } | { readonly problem: string };

export class ApiGenerated {
  readonly #host: ApiHost;
  /** The last text of each file with no error, by path. */
  readonly #good = new Map<string, string>();

  constructor(host: ApiHost) {
    this.#host = host;
  }

  /** The parser's and the validator's diagnostics of `project`; its text is remembered when none is an error. */
  check(path: string, text: string, project: ApiProject): readonly SourceDiagnostic[] {
    const found = [...project.parseDiagnostics, ...validateApi(project.source, project.index, project.context)];
    if (found.every((d) => d.severity !== 'error')) this.#good.set(path, text);
    return found;
  }

  /** The module of `side` of the `.fudapi` at `path`, with its texts as the author wrote them: translating is the build's business. */
  module(path: string, side: Side): ModuleAnswer {
    const text = this.#host.read(path) ?? '';
    this.check(path, text, this.#host.load(path, text));
    const good = this.#good.get(path);
    if (good === undefined) return { problem: NOTHING_GENERATED };
    const { source, index, context } = this.#host.load(path, good);
    return { name: `fudic:${source.id}.${side}.ts`, text: emitModule(source, index, context, side) };
  }
}
