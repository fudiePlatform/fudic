/**
 * One fact, one voice, in the editor: TypeScript is silent where a fudic error speaks.
 *
 * The rule the project check applies (`echoes`, in `@fudic/typecheck`), applied to TypeScript's
 * own diagnostics of the client projection: each one is carried back to the `.fud` and dropped
 * when it meets an error this server already reports there. The editor and the build then
 * underline the same things.
 */

import type { LanguageServiceContext, LanguageServicePlugin } from '@volar/language-service';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { Policy, Span } from '@fudic/diagnostics';
import { clientFileName, mapToSource, type VirtualFile } from '@fudic/language-core';
import type { BaselineJudged } from '@fudic/config';
import {
  echoes,
  fudBaselineDiagnostics,
  fudicDiagnostics,
  governFile,
  portableTypeDiagnostics,
  type FudicVirtualCode,
} from '@fudic/typecheck';
import { URI } from 'vscode-uri';
import type { CachedDocument } from '../document-cache.js';
import { isFudSourceUri } from '../uri.js';
import type { WorkspaceIndex } from '../workspace-index.js';
import { typeScriptService } from './ts-service.js';

/** The `.fud` behind a document of its client projection, with that projection. */
function clientOf(
  context: LanguageServiceContext,
  document: TextDocument,
): { cached: CachedDocument; client: VirtualFile } | undefined {
  const decoded = context.decodeEmbeddedDocumentUri(URI.parse(document.uri));
  if (decoded === undefined || !isFudSourceUri(decoded[0])) return undefined;
  const root = context.language.scripts.get(decoded[0])?.generated?.root as FudicVirtualCode<CachedDocument> | undefined;
  if (root === undefined || decoded[1] !== root.client.id) return undefined;
  const wanted = clientFileName(root.document.path);
  const client = root.document.virtuals.find((virtual) => virtual.fileName === wanted);
  return client === undefined ? undefined : { cached: root.document, client };
}

/**
 * The spans of the `.fud` where a fudic error of this file speaks — under the project's policy,
 * as the check computes them: a warning the project raises to an error speaks too.
 */
function spoken(
  context: LanguageServiceContext,
  cached: CachedDocument,
  index: WorkspaceIndex,
  policy: Policy | null,
  baseline: BaselineJudged | undefined,
): Span[] {
  const program = typeScriptService(context)?.getProgram();
  const found = [
    ...fudicDiagnostics(cached, index, baseline),
    ...(program === undefined ? [] : portableTypeDiagnostics(program, cached)),
    ...(program === undefined || baseline === undefined ? [] : fudBaselineDiagnostics(program, cached, baseline)),
  ];
  return governFile(cached.path, cached.source, found, policy, { parsed: cached })
    .filter((d) => d.severity === 'error' && (d.file === undefined || d.file === cached.path))
    .map((d) => d.span);
}

/**
 * Every TypeScript service, with its diagnostics of a `.fud` minus those fudic already says.
 * `policyFor` is how the project of a file reports each code; absent, every code as it is. `baselineFor`
 * is what it asks of the browser: a `FUD1524` the project raises to an error speaks too.
 */
export function silenceEchoes(
  plugins: readonly LanguageServicePlugin[],
  index: WorkspaceIndex,
  policyFor: (path: string) => Policy | null = () => null,
  baselineFor: (path: string) => BaselineJudged | undefined = () => undefined,
): LanguageServicePlugin[] {
  return plugins.map((plugin) => ({
    ...plugin,
    create(context) {
      const instance = plugin.create(context);
      const inner = instance.provideDiagnostics?.bind(instance);
      if (inner === undefined) return instance;
      return {
        ...instance,
        async provideDiagnostics(document, token) {
          const found = await inner(document, token);
          const at = clientOf(context, document);
          if (found == null || at === undefined) return found;
          const speaks = spoken(context, at.cached, index, policyFor(at.cached.path), baselineFor(at.cached.path));
          return found.filter((diagnostic) => {
            const start = mapToSource(at.client, document.offsetAt(diagnostic.range.start), 'verification');
            const end = mapToSource(at.client, document.offsetAt(diagnostic.range.end), 'verification');
            return start === undefined || end === undefined || !echoes({ start, end }, speaks);
          });
        },
      };
    },
  }));
}
