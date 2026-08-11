/**
 * The small conversions the adapter would otherwise have to branch on (SDD-25 §5).
 *
 * `src/extension.ts` is required to have no branches — it is the one file a test can only
 * reach through a double, so anything conditional in it is a claim nobody checks. Every
 * `??` and every path join it would need lives here instead, as functions over plain
 * shapes, with `vscode` nowhere in sight.
 */

import { join } from 'node:path';
import type { SnippetTarget, TypedText } from './ports.js';

/** The shape of `vscode.WorkspaceFolder`, reduced to what is read. */
export interface FolderLike {
  readonly uri: { readonly fsPath: string };
}

/** `workspace.workspaceFolders` is `undefined`, not `[]`, when no folder is open. */
export const folderPaths = (folders: readonly FolderLike[] | undefined): readonly string[] =>
  (folders ?? []).map((folder) => folder.uri.fsPath);

/** The shape of `vscode.TextEditor`, reduced to what the client reads. */
export interface EditorLike {
  readonly document: {
    readonly languageId: string;
    readonly uri: { toString(): string };
  };
}

/** `window.activeTextEditor` is `undefined` whenever the focus is not on an editor. */
export const languageOf = (editor: EditorLike | undefined): string | undefined =>
  editor?.document.languageId;

/**
 * The URI of the active document when it is a `.fud`, and nothing otherwise.
 *
 * The commands that need one need it to *be* a `.fud`: asking the server for the virtual
 * files of a `package.json` is not a smaller version of the right question, it is a
 * different one.
 */
export const fudUriOf = (editor: EditorLike | undefined): string | undefined =>
  editor?.document.languageId === 'fudic' ? editor.document.uri.toString() : undefined;

/** The shape of `vscode.TextDocumentChangeEvent`, reduced to what the tag closer reads. */
export interface ChangeEventLike {
  readonly document: {
    readonly languageId: string;
    readonly version: number;
    readonly uri: { toString(): string };
  };
  readonly contentChanges: readonly {
    readonly rangeOffset: number;
    readonly text: string;
  }[];
}

/**
 * The edit the user just made, or nothing when it is not one this client reacts to.
 *
 * The LAST change of the event, not the first: an edit that replaces a selection arrives as
 * several, and what the caret ends up after is the last one. An event with none at all is a
 * metadata change — the language of the document, its dirty state — and there is nothing to
 * react to.
 */
export const typedTextOf = (event: ChangeEventLike): TypedText | undefined => {
  const change = event.contentChanges[event.contentChanges.length - 1];
  if (change === undefined || event.document.languageId !== 'fudic') return undefined;

  return {
    uri: event.document.uri.toString(),
    offset: change.rangeOffset + change.text.length,
    text: change.text,
    version: event.document.version,
  };
};

/** The shape of `vscode.TextEditor`, reduced to what inserting a snippet needs. */
export interface SnippetEditorLike {
  readonly document: {
    readonly version: number;
    readonly uri: { toString(): string };
    positionAt(offset: number): unknown;
  };
  insertSnippet(
    snippet: unknown,
    location: unknown,
    options: { undoStopBefore: boolean; undoStopAfter: boolean },
  ): Thenable<boolean>;
};

/**
 * Insert the close tag, unless the editor has moved on.
 *
 * Three ways it can have moved on between the keystroke and the answer, and all three are the
 * same mistake if unchecked — writing into a document the user is no longer in: the focus went
 * elsewhere, it went to a different file, or they kept typing. The version is what catches the
 * third, and it is the one that actually happens: a fast typist is faster than a round trip.
 *
 * `$0` leads the snippet because that tabstop is the whole point. Without it the caret lands
 * past `</div>`, which is where the user did NOT want to be — and it is why this cannot be a
 * `TextEdit` and therefore cannot be on-type formatting.
 *
 * `undoStopBefore: false` welds the insertion to the `>` that caused it, so one undo takes both
 * back. Two would mean undoing a tag the user never typed.
 */
export const insertClosingTag = async (
  editor: SnippetEditorLike | undefined,
  target: SnippetTarget,
  snippetOf: (text: string) => unknown,
): Promise<void> => {
  if (editor === undefined) return;
  if (editor.document.uri.toString() !== target.uri) return;
  if (editor.document.version !== target.version) return;

  await editor.insertSnippet(
    snippetOf(`$0${target.text}`),
    editor.document.positionAt(target.offset),
    { undoStopBefore: false, undoStopAfter: true },
  );
};

/** Where the bundled server sits inside the installed extension (§4.5). */
export const bundledServerPath = (extensionPath: string): string =>
  join(extensionPath, 'dist', 'server.mjs');

/** Where VS Code keeps the TypeScript it ships with — the last resort of §4.1. */
export const vscodeTsdkPath = (appRoot: string): string =>
  join(appRoot, 'extensions', 'node_modules', 'typescript', 'lib');
