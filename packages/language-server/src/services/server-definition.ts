/**
 * Go-to-definition on a name a `.fud` takes from its `<link rel="server">` (BUG-59).
 *
 * The projection declares each of them as scaffolding — `declare const save: typeof
 * import('fudic:routes/usuarios')['save'];`, and `data` from the `load` — so that is where
 * TypeScript says they are defined. Scaffolding maps to nothing in the `.fud`, and Volar drops a
 * target it cannot map: Ctrl+Click on `save` went nowhere. What the developer wants there is the
 * declaration they wrote, in the `.fudapi`, so the target is replaced before Volar sees it.
 *
 * So is a target in the generated `.d.ts` of a contract: `personForm.name` and `data.title` are
 * members TypeScript finds there, and the field they stand for is written in the `.fudapi`.
 */

import { API_TYPES_DIR } from '@fudic/conventions';
import type { LanguageServicePlugin } from '@volar/language-service';
import type { LocationLink } from 'vscode-languageserver-protocol';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import type { ApiHost } from '../fudapi/host.js';
import { generatedDefinition, serverDefinition, type ServerName } from '../fudapi/navigation.js';
import { isFudSourceUri, uriToPath } from '../uri.js';

/** The two shapes `emitServerImports` and `emitDataDeclaration` write, one per line. */
const SERVER_NAME = /^declare const ([A-Za-z_$][\w$]*): typeof import\('fudic:([^']+)'\)\['\1'\];/u;
const SERVER_DATA = /^declare const data: import\('fudic:([^']+)'\)\.LoadData;/u;

/** Wrap every TypeScript service so a contract's name opens its `.fudapi`. */
export function redirectServerDefinitions(plugins: readonly LanguageServicePlugin[], host: ApiHost): LanguageServicePlugin[] {
  return plugins.map((plugin) => ({
    ...plugin,
    create(context) {
      const instance = plugin.create(context);
      const inner = instance.provideDefinition?.bind(instance);
      if (inner === undefined) return instance;

      return {
        ...instance,
        async provideDefinition(document, position, token) {
          const links = await inner(document, position, token);
          const decoded = context.decodeEmbeddedDocumentUri(URI.parse(document.uri));
          if (links === undefined || links === null || decoded === undefined || !isFudSourceUri(decoded[0])) return links;

          const fud = uriToPath(decoded[0]);
          return links.map((link) => redirected(host, fud, document, link) ?? link);
        },
      };
    },
  }));
}

/** Where a target goes instead: the scaffolding and the generated `.d.ts` both stand for a `.fudapi`. */
function redirected(host: ApiHost, fud: string, document: TextDocument, link: LocationLink): LocationLink | undefined {
  if (link.targetUri === document.uri) return contractLink(host, fud, document, link);
  const path = uriToPath(URI.parse(link.targetUri));
  if (!path.includes(`/${API_TYPES_DIR}/`)) return undefined;
  const { line, character } = link.targetSelectionRange.start;
  return retarget(link, generatedDefinition(host, path, line, character));
}

/** The `.fudapi` declaration behind a target on the scaffolding, or `undefined` when it is not one. */
function contractLink(host: ApiHost, fud: string, document: TextDocument, link: LocationLink): LocationLink | undefined {
  const { line } = link.targetSelectionRange.start;
  const text = document.getText({ start: { line, character: 0 }, end: { line: line + 1, character: 0 } });
  const name = SERVER_NAME.exec(text);
  const data = name === null ? SERVER_DATA.exec(text) : null;
  const [id, what]: [string | undefined, ServerName] =
    name !== null ? [name[2], { name: name[1]! }] : [data?.[1], { load: true }];
  if (id === undefined) return undefined;

  return retarget(link, serverDefinition(host, fud, id, what));
}

/** What was clicked stays TypeScript's (`originSelectionRange`); where it goes is the contract. */
function retarget(link: LocationLink, target: LocationLink | undefined): LocationLink | undefined {
  return target === undefined ? undefined : { ...link, ...target };
}
