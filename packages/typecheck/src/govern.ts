/**
 * What a person is shown about a file: its diagnostics under its project's policy and its own
 * `fud-disable` comments. The check, the build and the editor all come through here, so with
 * the same file and the same `fudic.json` the three say the same thing.
 *
 * Each kind of file hands over the comments of its own language: a `.fud` those of its three
 * regions, a `.fudapi` and a `.fudspec` their `#` lines, a stylesheet its CSS comments and a
 * TypeScript module its JS ones.
 */

import { apiComments } from '@fudic/api';
import { cssComments, fudComments, JsBatch, type HtmlDocument, type JsBatchResult } from '@fudic/compiler';
import { ProjectPolicies, readProjectConfig, type ConfigIo } from '@fudic/config';
import {
  govern,
  LineMap,
  type FudDiagnostic,
  type GovernOptions,
  type Policy,
  type SourceComment,
  type SourceDiagnostic,
} from '@fudic/diagnostics';
import { specComments } from '@fudic/spec';
import { batchDocumentJs } from './js-batch.js';
import { parseFud } from './parse.js';

/** What a `.fud`'s parse holds that its comments are read from. */
export interface FudParse {
  readonly html: HtmlDocument;
  readonly js: { readonly result: JsBatchResult };
}

/** The comments of the file at `path`, in the language its extension says. `parsed` saves a `.fud` its parse. */
export function commentsOf(path: string, source: string, parsed?: FudParse): readonly SourceComment[] {
  if (path.endsWith('.fud')) {
    return fudComments(source, ...fudParts(source, parsed));
  }
  if (path.endsWith('.fudapi')) return apiComments(source);
  if (path.endsWith('.fudspec')) return specComments(source);
  if (path.endsWith('.css')) return cssComments(source);
  if (/\.[cm]?[jt]s$/u.test(path)) return scriptComments(source);
  return [];
}

/** The tree and the Oxc batch of a `.fud`: the caller's, or parsed here when it has none. */
function fudParts(source: string, parsed: FudParse | undefined): [HtmlDocument, JsBatchResult] {
  if (parsed !== undefined) return [parsed.html, parsed.js.result];
  const { document, html } = parseFud(source);
  return [html, batchDocumentJs(source, document).result];
}

/** The comments of a JavaScript or TypeScript module, read by Oxc once. */
function scriptComments(source: string): readonly SourceComment[] {
  const batch = new JsBatch(source);
  batch.add('module-statements', { start: 0, end: source.length });
  return batch.parse().value.comments;
}

export interface GovernFileOptions extends GovernOptions {
  /** The `.fud`'s parse, when the caller already holds it. */
  readonly parsed?: FudParse;
}

/** The diagnostics of the file at `path` as they are shown: see `govern` of `@fudic/diagnostics`. */
export function governFile<D extends FudDiagnostic>(
  path: string,
  source: string,
  diagnostics: readonly D[],
  policy: Policy | null,
  options: GovernFileOptions = {},
): readonly (D | SourceDiagnostic)[] {
  const comments = commentsOf(path, source, options.parsed);
  return govern(diagnostics, policy, comments, new LineMap(source), {
    file: path,
    ...(options.complete === true ? { complete: true } : {}),
  });
}

/**
 * Which project each file obeys, over a `readFile` that answers `undefined` for a missing file.
 * Each `fudic.json` is read once: make a new one when one may have changed.
 */
export function projectPolicies(readFile: (path: string) => string | undefined): ProjectPolicies {
  const texts = new Map<string, string | undefined>();
  const text = (path: string): string | undefined => {
    if (!texts.has(path)) texts.set(path, readFile(path));
    return texts.get(path);
  };
  const io: ConfigIo = {
    exists: (path) => text(path) !== undefined,
    // Asked only after `exists` said yes, and remembered: the text is there.
    read: (path) => text(path)!,
  };
  return new ProjectPolicies(io, (root) => readProjectConfig(root, io).config);
}
