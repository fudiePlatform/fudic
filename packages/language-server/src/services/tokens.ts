/**
 * The style tokens in the editor: `var(--` completes them, the pointer over one says what it is
 * and where it comes from, and «go to definition» opens the sheet that declares it.
 *
 * The CSS service of Volar only sees the custom properties of the `<style>` being edited, and a
 * token lives in a sheet of `fudic.json`, often in a library: a developer who wants to know
 * which colours exist has to open sheets, and an assistant that does not open them invents one.
 * The list is `@fudic/typecheck`'s `projectTokens`, the same one a tool that is not an editor
 * reads.
 *
 * It answers in any CSS document: the embedded code of a `.fud`'s `<style>` and a `.css` of the
 * project. Which project is decided by the file the document is, never by the open folder.
 */

import type { LanguageServiceContext, LanguageServicePlugin } from '@volar/language-service';
import { projectTokens, type ProjectTokens, type Token } from '@fudic/typecheck/tokens';
import { toPosix } from '@fudic/typecheck';
import { owningPackage } from '@fudic/resolve';
import { TextDocument, type Position } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { pathToUri, uriToPath } from '../uri.js';
import type { FileSystemScanner } from '../types.js';

/** `CompletionItemKind.Variable` of LSP: a custom property is a variable. */
const VARIABLE = 6;

/** The custom property being typed right after `var(`, up to the cursor. */
const TYPING = /var\(\s*(--[\w-]*)$/u;

/** A custom property name, as a hover or a definition looks for it around the cursor. */
const NAME_CHAR = /[\w-]/u;

/**
 * The tokens of each project, read once and kept until a sheet or a `fudic.json` changes.
 *
 * Forgetting every project on any change is deliberate: which sheets a project reads is in its
 * `fudic.json` and in those of its whole library chain, so «does this change concern that
 * project» costs the walk it would save.
 */
export class TokenCache {
  readonly #fs: FileSystemScanner;
  readonly #byProject = new Map<string, ProjectTokens>();

  constructor(fs: FileSystemScanner) {
    this.#fs = fs;
  }

  /** The tokens `file` sees: those of the package it belongs to. None outside any package. */
  tokensFor(file: string): readonly Token[] {
    const root = owningPackage(toPosix(file), this.#fs);
    if (root === undefined) return [];
    let found = this.#byProject.get(root);
    if (found === undefined) {
      found = projectTokens(root, this.#fs);
      this.#byProject.set(root, found);
    }
    return found.tokens;
  }

  /** The text of a sheet that declares tokens, to place a definition in it. */
  read(path: string): string | undefined {
    return this.#fs.readFile(path);
  }

  /** A file changed on disk: when it can change a token list, every list is read again. */
  invalidate(path: string): void {
    if (TokenCache.affects(path)) this.#byProject.clear();
  }

  /** Whether a change to `path` can change what a project's tokens are. */
  static affects(path: string): boolean {
    return path.endsWith('.css') || path.endsWith('/fudic.json');
  }
}

/** The tokens service. */
export function createFudicTokenService(tokens: TokenCache): LanguageServicePlugin {
  return {
    name: 'fudic-tokens',
    capabilities: {
      completionProvider: { triggerCharacters: ['-'] },
      hoverProvider: true,
      definitionProvider: true,
    },
    create(context) {
      return {
        provideCompletionItems(document, position) {
          const file = cssFileOf(context, document);
          if (file === undefined) return undefined;
          const line = document.getText({ start: { line: position.line, character: 0 }, end: position });
          const typed = TYPING.exec(line)?.[1];
          if (typed === undefined) return undefined;
          const range = { start: { line: position.line, character: position.character - typed.length }, end: position };
          return {
            isIncomplete: false,
            items: latest(tokens.tokensFor(file)).map((token) => ({
              label: token.name,
              kind: VARIABLE,
              detail: token.value,
              documentation: { kind: 'markdown' as const, value: tokenMarkdown(token, tokens.tokensFor(file)) },
              textEdit: { range, newText: token.name },
            })),
          };
        },

        provideHover(document, position) {
          const found = tokenAt(context, tokens, document, position);
          if (found === undefined) return undefined;
          return {
            contents: { kind: 'markdown' as const, value: tokenMarkdown(found.token, tokens.tokensFor(found.file)) },
            range: found.range,
          };
        },

        provideDefinition(document, position) {
          const found = tokenAt(context, tokens, document, position);
          const text = found === undefined ? undefined : tokens.read(found.token.path);
          if (found === undefined || text === undefined) return undefined;
          const sheet = TextDocument.create(pathToUri(found.token.path).toString(), 'css', 0, text);
          const range = { start: sheet.positionAt(found.token.span.start), end: sheet.positionAt(found.token.span.end) };
          return [
            {
              originSelectionRange: found.range,
              targetUri: sheet.uri,
              targetRange: range,
              targetSelectionRange: range,
            },
          ];
        },
      };
    },
  };
}

/**
 * The CSS service, without repeating the tokens this service answers for.
 *
 * Volar's CSS service offers every custom property the `<style>` already reads, with no value
 * and no doc, so a token used once came up twice in the list — once bare, once with what it is.
 * Over a token its hover says nothing ours does not, and Volar joins both hovers into one. So
 * its completion drops the names that are tokens of the file, and its hover steps aside over a
 * token. A custom property local to the `<style>` is not a token and is still its to offer.
 */
export function withoutTokenEchoes(plugin: LanguageServicePlugin, tokens: TokenCache): LanguageServicePlugin {
  return {
    ...plugin,
    create(context) {
      const instance = plugin.create(context);
      const completion = instance.provideCompletionItems?.bind(instance);
      const hover = instance.provideHover?.bind(instance);
      return {
        ...instance,
        ...(completion === undefined
          ? {}
          : {
              async provideCompletionItems(document, position, completionContext, token) {
                const list = await completion(document, position, completionContext, token);
                const file = cssFileOf(context, document);
                if (list === undefined || list === null || file === undefined) return list;
                const names = new Set(tokens.tokensFor(file).map((it) => it.name));
                return { ...list, items: list.items.filter((item) => !names.has(item.label)) };
              },
            }),
        ...(hover === undefined
          ? {}
          : {
              provideHover(document, position, token) {
                if (tokenAt(context, tokens, document, position) !== undefined) return undefined;
                return hover(document, position, token);
              },
            }),
      };
    },
  };
}

/**
 * The file a CSS document belongs to: the `.fud` its `<style>` is embedded in, or the `.css`
 * itself. Nothing for a document that is not CSS.
 */
function cssFileOf(context: LanguageServiceContext, document: TextDocument): string | undefined {
  if (document.languageId !== 'css') return undefined;
  const uri = URI.parse(document.uri);
  return uriToPath(context.decodeEmbeddedDocumentUri(uri)?.[0] ?? uri);
}

/**
 * One token per name, the LAST one declared: the one that wins in CSS is the one a completion
 * writes, and the others would be the same label twice.
 */
function latest(all: readonly Token[]): readonly Token[] {
  const byName = new Map<string, Token>();
  for (const token of all) {
    byName.delete(token.name);
    byName.set(token.name, token);
  }
  return [...byName.values()];
}

/** The token under the cursor inside a `var(…)`, with the range of its name. */
function tokenAt(
  context: LanguageServiceContext,
  tokens: TokenCache,
  document: TextDocument,
  position: Position,
): { readonly token: Token; readonly file: string; readonly range: { start: Position; end: Position } } | undefined {
  const file = cssFileOf(context, document);
  if (file === undefined) return undefined;
  const text = document.getText();
  const at = document.offsetAt(position);
  let start = at;
  while (start > 0 && NAME_CHAR.test(text.charAt(start - 1))) start--;
  let end = at;
  while (end < text.length && NAME_CHAR.test(text.charAt(end))) end++;
  const name = text.slice(start, end);
  // Read inside `var(` only: a `--x:` on the left of a declaration is the property being
  // declared, which the CSS service already answers for.
  if (!name.startsWith('--') || !/var\(\s*$/u.test(text.slice(0, start))) return undefined;
  const token = latest(tokens.tokensFor(file)).find((candidate) => candidate.name === name);
  if (token === undefined) return undefined;
  return { token, file, range: { start: document.positionAt(start), end: document.positionAt(end) } };
}

/**
 * What a token is, for a hover and for a completion's documentation.
 *
 * `all` is every token the file sees: when an app redeclares a library's token, the one that
 * wins is the one shown, and the ones it overrides are named under it — otherwise a hover in
 * the app hides where the token comes from in the first place.
 */
export function tokenMarkdown(token: Token, all: readonly Token[]): string {
  const parts = [`\`${token.name}: ${token.value}\``];
  if (token.doc !== undefined) parts.push(token.doc);
  parts.push(`From ${origin(token)}`);
  const overridden = all.filter((other) => other.name === token.name && other !== token);
  for (const other of overridden) parts.push(`Overrides \`${other.value}\` from ${origin(other)}`);
  return parts.join('\n\n');
}

/** Where a token is declared: its package and its style. */
function origin(token: Token): string {
  const from = token.from === null ? 'this project' : `\`${token.from}\``;
  // A token of an optional style is seen only by a component that adopts it, and saying so is
  // what keeps a completion from offering a value that renders as nothing.
  const style = token.style.global
    ? `style \`${token.style.name}\``
    : `style \`${token.style.name}\`, only in components that adopt it`;
  return `${from} · ${style}`;
}
