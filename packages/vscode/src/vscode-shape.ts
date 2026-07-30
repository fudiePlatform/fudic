/**
 * The small conversions the adapter would otherwise have to branch on (SDD-25 §5).
 *
 * `src/extension.ts` is required to have no branches — it is the one file a test can only
 * reach through a double, so anything conditional in it is a claim nobody checks. Every
 * `??` and every path join it would need lives here instead, as functions over plain
 * shapes, with `vscode` nowhere in sight.
 */

import { join } from 'node:path';

/** The shape of `vscode.WorkspaceFolder`, reduced to what is read. */
export interface FolderLike {
  readonly uri: { readonly fsPath: string };
}

/** `workspace.workspaceFolders` is `undefined`, not `[]`, when no folder is open. */
export const folderPaths = (folders: readonly FolderLike[] | undefined): readonly string[] =>
  (folders ?? []).map((folder) => folder.uri.fsPath);

/** The shape of `vscode.TextEditor`, reduced to what the status bar needs. */
export interface EditorLike {
  readonly document: { readonly languageId: string };
}

/** `window.activeTextEditor` is `undefined` whenever the focus is not on an editor. */
export const languageOf = (editor: EditorLike | undefined): string | undefined =>
  editor?.document.languageId;

/** Where the bundled server sits inside the installed extension (§4.5). */
export const bundledServerPath = (extensionPath: string): string =>
  join(extensionPath, 'dist', 'server.cjs');

/** Where VS Code keeps the TypeScript it ships with — the last resort of §4.1. */
export const vscodeTsdkPath = (appRoot: string): string =>
  join(appRoot, 'extensions', 'node_modules', 'typescript', 'lib');
