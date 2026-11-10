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
import type { Hover, LocationLink } from 'vscode-languageserver-protocol';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import type { ApiHost } from '../fudapi/host.js';
import { generatedDefinition, pipeDefinition, serverDefinition, type PipeTarget, type ServerName } from '../fudapi/navigation.js';
import { isFudSourceUri, uriToPath } from '../uri.js';

/** The two shapes `emitServerImports` and `emitDataDeclaration` write, one per line. */
const SERVER_NAME = /^declare const ([A-Za-z_$][\w$]*): typeof import\('fudic:([^']+)'\)\['\1'\];/u;
const SERVER_DATA = /^declare const data: import\('fudic:([^']+)'\)\.LoadData;/u;

/**
 * Wrap every TypeScript service so a contract's name opens its `.fudapi`. A pipe the view
 * imports too (SDD-71 §5): its definition is its `pipe`, and its hover carries that pipe's
 * documentation under TypeScript's own.
 */
export function redirectServerDefinitions(plugins: readonly LanguageServicePlugin[], host: ApiHost): LanguageServicePlugin[] {
  return plugins.map((plugin) => ({
    ...plugin,
    create(context) {
      const instance = plugin.create(context);
      const inner = instance.provideDefinition?.bind(instance);
      if (inner === undefined) return instance;
      const fudOf = (document: TextDocument): string | undefined => {
        const decoded = context.decodeEmbeddedDocumentUri(URI.parse(document.uri));
        return decoded === undefined || !isFudSourceUri(decoded[0]) ? undefined : uriToPath(decoded[0]);
      };
      const hover = instance.provideHover?.bind(instance);

      return {
        ...instance,
        async provideDefinition(document, position, token) {
          const links = await inner(document, position, token);
          const fud = fudOf(document);
          if (links === undefined || links === null || fud === undefined) return links;
          return links.map((link) => redirected(host, fud, document, link) ?? link);
        },
        ...(hover === undefined
          ? {}
          : {
              async provideHover(document, position, token) {
                const shown = await hover(document, position, token);
                if (shown === undefined || shown === null || fudOf(document) === undefined) return shown;
                const links = (await inner(document, position, token)) ?? [];
                const pipe = links
                  .map((l) => pipeDefinition(host, uriToPath(URI.parse(l.targetUri))))
                  .find((p) => p !== undefined);
                return pipe === undefined ? shown : withPipe(shown, pipe);
              },
            }),
      };
    },
  }));
}

/** TypeScript's hover, and under it the `pipe` as written and its documentation. */
function withPipe(shown: Hover, pipe: PipeTarget): Hover {
  const own = Array.isArray(shown.contents) ? shown.contents : [shown.contents];
  const text = own.map((c) => (typeof c === 'string' ? c : c.value)).join('\n\n');
  const parts = [text, `\`\`\`fudapi\n${pipe.signature}\n\`\`\``, ...(pipe.doc !== undefined ? [pipe.doc] : [])];
  return { ...shown, contents: { kind: 'markdown', value: parts.join('\n\n') } };
}

/** Where a target goes instead: the scaffolding and the generated `.d.ts` both stand for a `.fudapi`. */
function redirected(host: ApiHost, fud: string, document: TextDocument, link: LocationLink): LocationLink | undefined {
  if (link.targetUri === document.uri) return contractLink(host, fud, document, link);
  const path = uriToPath(URI.parse(link.targetUri));
  if (isLinkUrl(host, path, link)) return urlLink(host, fud, document, link);
  if (!path.includes(`/${API_TYPES_DIR}/`)) return retarget(link, pipeDefinition(host, path)?.link);
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

/** Whether a target is the `url` of `Linkable` (`@fudic/http`): the link of a `get` (SDD-81 §3.4). */
function isLinkUrl(host: ApiHost, path: string, link: LocationLink): boolean {
  const text = host.read(path);
  const line = text?.split('\n')[link.targetSelectionRange.start.line] ?? '';
  return /^\s*url\(/u.test(line) && text!.includes('interface Linkable<');
}

/**
 * `save.url(…)` opens the `get` it links to, in the `.fudapi`: the method is the framework's, the
 * function is what the developer wrote. The name is what stands right before `.url` in the
 * projection; a name the scaffolding does not declare (an import of `@code`) keeps its target.
 */
function urlLink(host: ApiHost, fud: string, document: TextDocument, link: LocationLink): LocationLink | undefined {
  // TypeScript's definitions always say what was clicked: `definitionAndBoundSpan`.
  const origin = link.originSelectionRange!;
  const before = document.getText({ start: { line: origin.start.line, character: 0 }, end: origin.start });
  const name = /([A-Za-z_$][\w$]*)\s*\.\s*$/u.exec(before)?.[1];
  const declared = name === undefined ? undefined : new RegExp(`^declare const ${name.replace(/\$/gu, '\\$')}: typeof import\\('fudic:([^']+)'\\)`, 'mu').exec(document.getText());
  if (declared === null || declared === undefined) return undefined;
  return retarget(link, serverDefinition(host, fud, declared[1]!, { name: name! }));
}

/** What was clicked stays TypeScript's (`originSelectionRange`); where it goes is the contract. */
function retarget(link: LocationLink, target: LocationLink | undefined): LocationLink | undefined {
  return target === undefined ? undefined : { ...link, ...target };
}
