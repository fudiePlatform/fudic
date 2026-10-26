/**
 * A `.fudapi` as every request of its service sees it: the source URI, the text, its project
 * (tree, index, context) and the parser's diagnostics. Parsing is a pass over a few dozen
 * lines, and the host keeps each file's last parse, so a request reads the live text and
 * nothing is cached that could fall behind the editor.
 */

import type { ApiContext, ApiIndex, ApiSource } from '@fudic/api';
import type { SourceDiagnostic, Span } from '@fudic/diagnostics';
import type { LanguageServiceContext } from '@volar/language-service';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { Range } from 'vscode-languageserver-protocol';
import { URI } from 'vscode-uri';
import { isFudapiUri, pathToUri, uriToPath } from '../uri.js';
import type { ApiHost } from './host.js';

export interface ApiDocument {
  /** The `.fudapi` itself, not the virtual code Volar hands over. */
  readonly uri: URI;
  readonly path: string;
  readonly text: string;
  readonly source: ApiSource;
  readonly index: ApiIndex;
  readonly context: ApiContext;
  readonly parseDiagnostics: readonly SourceDiagnostic[];
}

/** The `.fudapi` behind a document, or `undefined` when the document is not one. */
export function apiDocumentOf(context: LanguageServiceContext, document: TextDocument, host: ApiHost): ApiDocument | undefined {
  const uri = URI.parse(document.uri);
  const source = context.decodeEmbeddedDocumentUri(uri)?.[0] ?? uri;
  if (!isFudapiUri(source)) return undefined;

  const text = document.getText();
  const path = uriToPath(source);
  return { uri: source, path, text, ...host.load(path, text) };
}

/** Whether `offset` touches `span`, its end included: the cursor right after a word is on it. */
export function touches(span: Span, offset: number): boolean {
  return span.start <= offset && offset <= span.end;
}

/** A span of a file as an LSP range, over `text`. */
export function rangeOf(path: string, text: string, span: Span): Range {
  const document = TextDocument.create(pathToUri(path).toString(), 'plaintext', 0, text);
  return { start: document.positionAt(span.start), end: document.positionAt(span.end) };
}
