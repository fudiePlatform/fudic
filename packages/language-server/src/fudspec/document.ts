/**
 * A `.fudspec` as every request of its service sees it: the source URI, the text, the tree and
 * the parser's diagnostics. Parsing is a pass over a few dozen lines, so it is done per request
 * and nothing is cached that could fall behind the editor.
 */

import type { LanguageServiceContext } from '@volar/language-service';
import type { SourceDiagnostic, Span } from '@fudic/diagnostics';
import { parseSpec, type BlockKind, type SpecFile, type TermLine, type TermModule } from '@fudic/spec';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { Range } from 'vscode-languageserver-protocol';
import { URI } from 'vscode-uri';
import { isFudspecUri, pathToUri, uriToPath } from '../uri.js';

export interface SpecDocument {
  /** The `.fudspec` itself, not the virtual code Volar hands over. */
  readonly uri: URI;
  readonly path: string;
  readonly text: string;
  readonly file: SpecFile;
  readonly parseDiagnostics: readonly SourceDiagnostic[];
}

/**
 * The `.fudspec` behind a document, or `undefined` when the document is not one. Volar hands
 * the root over as an embedded document, so the source URI is decoded first; with no embedded
 * codes, the root is the only document a `.fudspec` has.
 */
export function specDocumentOf(context: LanguageServiceContext, document: TextDocument): SpecDocument | undefined {
  const uri = URI.parse(document.uri);
  const source = context.decodeEmbeddedDocumentUri(uri)?.[0] ?? uri;
  if (!isFudspecUri(source)) return undefined;

  const text = document.getText();
  const parsed = parseSpec(text);
  return { uri: source, path: uriToPath(source), text, file: parsed.value, parseDiagnostics: parsed.diagnostics };
}

/** A term line and the block it is in. */
export interface PlacedTerm {
  readonly block: BlockKind;
  readonly term: TermLine;
}

/** Every term line of the file, in order, with its block. */
export function termLines(file: SpecFile): readonly PlacedTerm[] {
  return file.criteria.flatMap((criterion) =>
    criterion.blocks.flatMap((block) => block.terms.map((term) => ({ block: block.block, term }))),
  );
}

/** Whether `offset` touches `span`, its end included: the cursor right after a word is on it. */
export function touches(span: Span, offset: number): boolean {
  return span.start <= offset && offset <= span.end;
}

/** How a term is written with its parameters: `min-height target:element px:number`. */
export function signatureOf(module: TermModule): string {
  return [module.name, ...module.params.map((p) => `${p.name}:${p.type}`)].join(' ');
}

function toRange(path: string, text: string, span: Span): Range {
  const document = TextDocument.create(pathToUri(path).toString(), 'plaintext', 0, text);
  return { start: document.positionAt(span.start), end: document.positionAt(span.end) };
}

/** A span of the `.fudspec` itself as an LSP range. */
export function spanRange(spec: SpecDocument, span: Span): Range {
  return toRange(spec.path, spec.text, span);
}

/** A span of any file as an LSP range, the file read through `read` unless it is this one. */
export function rangeIn(spec: SpecDocument, path: string, span: Span, read: (path: string) => string | undefined): Range {
  return toRange(path, path === spec.path ? spec.text : (read(path) ?? ''), span);
}
