/**
 * Which TypeScript the server will typecheck with (SDD-25 §4.1).
 *
 * The project's version wins, always: a server that typechecks with a different version
 * than the build produces diagnostics CI cannot reproduce. When there is none, the answer
 * is the empty string and `degraded` — HTML and CSS keep working, and activation continues.
 * Never an exception, never an aborted start (criterion 9).
 */

import { isAbsolute, join } from 'node:path';
import type { FileSystemPort } from './ports.js';

export type TsdkSource = 'setting' | 'workspace' | 'vscode' | 'none';

export interface ResolvedTsdk {
  /** Directory holding `typescript.js`. Empty exactly when degraded. */
  readonly path: string;
  readonly source: TsdkSource;
  readonly degraded: boolean;
}

export interface TsdkInput {
  /** The workspace's `typescript.tsdk`, absolute or relative to a folder. */
  readonly configured: unknown;
  readonly folders: readonly string[];
  /** The lib directory shipped inside VS Code, when it can be located. */
  readonly vscodeTsdk: string | null;
  readonly fs: FileSystemPort;
}

/** A directory is a tsdk when the compiler is actually in it. */
const isTsdk = (fs: FileSystemPort, dir: string): boolean => fs.exists(join(dir, 'typescript.js'));

const fromSetting = ({ configured, folders, fs }: TsdkInput): string | null => {
  if (typeof configured !== 'string' || configured.trim() === '') return null;
  const value = configured.trim();
  if (isAbsolute(value)) return isTsdk(fs, value) ? value : null;
  // A relative `typescript.tsdk` is relative to the folder it was configured in, which is
  // the overwhelmingly common form: `node_modules/typescript/lib`.
  return folders.map((folder) => join(folder, value)).find((dir) => isTsdk(fs, dir)) ?? null;
};

const fromWorkspace = ({ folders, fs }: TsdkInput): string | null =>
  folders
    .map((folder) => join(folder, 'node_modules', 'typescript', 'lib'))
    .find((dir) => isTsdk(fs, dir)) ?? null;

const fromVsCode = ({ vscodeTsdk, fs }: TsdkInput): string | null =>
  vscodeTsdk !== null && isTsdk(fs, vscodeTsdk) ? vscodeTsdk : null;

/**
 * Degraded means *not the project's TypeScript*, not *no TypeScript at all*.
 *
 * §4.1 lists VS Code's own copy as the last resort, and §6.9 expects a workspace without
 * TypeScript to show the degraded state — which it never would if VS Code's copy silently
 * counted as success. The invariant in §5 settles it: "the TypeScript version is the
 * project's". Typechecking against a version the build does not use produces diagnostics CI
 * cannot reproduce, so it earns the warning even though the server does start with it.
 */
const isDegraded = (source: TsdkSource): boolean => source !== 'setting' && source !== 'workspace';

export const resolveTsdk = (input: TsdkInput): ResolvedTsdk => {
  const found: readonly (readonly [TsdkSource, string | null])[] = [
    ['setting', fromSetting(input)],
    ['workspace', fromWorkspace(input)],
    ['vscode', fromVsCode(input)],
  ];

  for (const [source, path] of found) {
    if (path !== null) return { path, source, degraded: isDegraded(source) };
  }
  return { path: '', source: 'none', degraded: true };
};

/** What the user is told, once, when the project's TypeScript is not what is running (§4.1). */
export const degradedMessage = (source: TsdkSource): string =>
  source === 'vscode'
    ? "Fudic: this workspace has no TypeScript of its own, so the server is using VS Code's. Types may not match your build."
    : 'Fudic: no TypeScript found. HTML and CSS keep working; types, completion and diagnostics do not.';
