/**
 * What the client is launched with (SDD-25 §4.1).
 *
 * A pure function on already-resolved inputs, so the thing hardest to check by hand — which
 * globs the server is watching — is the thing a test states outright.
 */

import type { ClientLaunch } from './ports.js';
import type { FudicSettings } from './settings.js';

/**
 * The three patterns of §4.1.
 *
 * `**\/*.fud` keeps the workspace index current, so a new component resolves without a
 * restart. The other two are what invalidates the TypeScript program: a `tsconfig` decides
 * which files exist and under what options, and `package.json` decides which TypeScript.
 */
export const FILE_EVENTS: readonly string[] = [
  '**/*.fud',
  '**/tsconfig*.json',
  '**/package.json',
];

export const buildClientLaunch = (
  settings: FudicSettings,
  serverPath: string,
  tsdk: string,
): ClientLaunch => ({
  serverPath,
  // `scheme: 'file'` on purpose: the server resolves `href` against the workspace index,
  // which is paths on disk. An untitled buffer has nothing to resolve against.
  documentSelector: [{ scheme: 'file', language: 'fudic' }],
  fileEvents: FILE_EVENTS,
  initializationOptions: {
    typescript: { tsdk },
    fudic: {
      templateDiagnostics: settings.templateDiagnostics,
      exposeVirtualFiles: settings.exposeVirtualFiles,
    },
  },
});

// `fudic.trace.server` is deliberately absent from the launch: `vscode-languageclient`
// reads `<id>.trace.server` itself, and the client is registered under the id `fudic`.
// Passing it a second time by hand would make two sources of truth for one setting.
