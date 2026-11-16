/**
 * What the client is launched with (SDD-25 §4.1).
 *
 * A pure function on already-resolved inputs, so the thing hardest to check by hand — which
 * globs the server is watching — is the thing a test states outright.
 */

import type { ClientLaunch } from './ports.js';
import type { FudicSettings } from './settings.js';

/**
 * The patterns the server watches: the four of §4.1, and the two a `.fudspec` needs (SDD-52).
 *
 * `**\/*.fud` keeps the workspace index current, so a new component resolves without a
 * restart. Two of the others are what invalidates the TypeScript program: a `tsconfig`
 * decides which files exist and under what options, and `package.json` decides which
 * TypeScript. `fudic.json` is who the project is (SDD-41): editing the prefix and saving
 * changes what the `component` snippet proposes next, without reopening anything.
 */
export const FILE_EVENTS: readonly string[] = [
  '**/*.fud',
  '**/tsconfig*.json',
  '**/package.json',
  '**/fudic.json',
  // The sheets of `globalStyles` and `styles`: a token edited there is what `var(--` offers next.
  '**/*.css',
  // What an open `.fudspec` is validated against (SDD-52 §4.4): the workspace's term modules
  // and the fixture files. A term deleted on disk turns its lines red without reopening.
  '**/fudic/terms/**/*.js',
  '**/*.fixture.ts',
  // The catalogs of an app (SDD-58 §4.11): the hover over a message shows the new text.
  '**/src/locales/**/*.json',
  // The contracts (SDD-60 §4.9): a rule changed in one `.fudapi` revalidates the one that uses
  // it. A library's `fudapi/` changes with its `package.json`, already watched above.
  '**/*.fudapi',
  // Who implements a contract (SDD-75 §4.2): a handler written or removed changes the lens over
  // its declaration without reopening the `.fudapi`.
  '**/src/server/**',
  '**/src/browser/**',
  // And a pipe's implementation, beside its contract in the folder of pipes.
  '**/src/pipes/**',
  // The headers of an app (SDD-84 §3.8): whether its pages require Trusted Types, and what an
  // open `.headers` says once the build left what its output needs.
  '**/*.headers',
  '**/.fudic/csp-needs.json',
];

export const buildClientLaunch = (
  settings: FudicSettings,
  serverPath: string,
  tsdk: string,
): ClientLaunch => ({
  serverPath,
  // `scheme: 'file'` on purpose: the server resolves `href` against the workspace index,
  // which is paths on disk. An untitled buffer has nothing to resolve against.
  // A `.fudspec` too (SDD-52): its terms resolve against the disk the same way.
  documentSelector: [
    { scheme: 'file', language: 'fudic' },
    { scheme: 'file', language: 'fudspec' },
    // And a `.fudapi` (SDD-60): its project is the `.fudapi` files on disk.
    { scheme: 'file', language: 'fudapi' },
    // And a `.css`, for the tokens its `var(--` offers (SDD-63 §3.5). Volar's CSS service stays
    // out of it: VS Code has its own there.
    { scheme: 'file', language: 'css' },
    // And the `fudic.json` of a project, for what the build says about it (SDD-81). By name:
    // any other JSON is none of this server's business.
    { scheme: 'file', pattern: '**/fudic.json' },
    // And the three `.headers` of an app (SDD-84 §3.8).
    { scheme: 'file', language: 'fudheaders' },
  ],
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
