/**
 * The conversions the adapter is not allowed to branch on (SDD-25 §5).
 */

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bundledServerPath, folderPaths, vscodeTsdkPath } from '../src/vscode-shape.js';

describe('folderPaths', () => {
  it('reads an open workspace', () => {
    expect(folderPaths([{ uri: { fsPath: '/a' } }, { uri: { fsPath: '/b' } }])).toEqual(['/a', '/b']);
  });

  it('reads no open folder as none, not as a crash', () => {
    // `workspace.workspaceFolders` is `undefined` rather than `[]` when the editor has a
    // loose file open, which is exactly the state someone is in when they double-click a
    // `.fud` from a file manager.
    expect(folderPaths(undefined)).toEqual([]);
  });
});

describe('paths inside the installation', () => {
  it('finds the bundled server next to the extension', () => {
    expect(bundledServerPath('/ext')).toBe(join('/ext', 'dist', 'server.cjs'));
  });

  it("finds VS Code's own TypeScript under the app root", () => {
    expect(vscodeTsdkPath('/vscode')).toBe(
      join('/vscode', 'extensions', 'node_modules', 'typescript', 'lib'),
    );
  });
});
