/**
 * The conversions the adapter is not allowed to branch on (SDD-25 §5).
 */

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  bundledServerPath,
  folderPaths,
  fudUriOf,
  insertClosingTag,
  typedTextOf,
  vscodeTsdkPath,
} from '../src/vscode-shape.js';

const editor = (languageId: string) => ({
  document: { languageId, uri: { toString: () => 'file:///x.fud' } },
});

describe('fudUriOf', () => {
  it('gives the URI of an active .fud', () => {
    expect(fudUriOf(editor('fudic'))).toBe('file:///x.fud');
  });

  it('gives nothing for another language', () => {
    // Asking the server for the virtual files of a `package.json` is not a smaller version
    // of the right question; it is a different one.
    expect(fudUriOf(editor('json'))).toBeUndefined();
  });

  it('gives nothing when there is no editor', () => {
    expect(fudUriOf(undefined)).toBeUndefined();
  });
});

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

describe('typedTextOf', () => {
  const event = (
    changes: readonly { rangeOffset: number; text: string }[],
    languageId = 'fudic',
  ) => ({
    document: { languageId, version: 4, uri: { toString: () => 'file:///x.fud' } },
    contentChanges: changes,
  });

  it('reports what was typed and where the caret ended up', () => {
    expect(typedTextOf(event([{ rangeOffset: 10, text: '>' }]))).toEqual({
      uri: 'file:///x.fud',
      offset: 11,
      text: '>',
      version: 4,
    });
  });

  it('reports the LAST change: an edit over a selection arrives as several', () => {
    const typed = typedTextOf(
      event([
        { rangeOffset: 0, text: '' },
        { rangeOffset: 10, text: '>' },
      ]),
    );

    expect(typed?.offset).toBe(11);
  });

  it('ignores a document of another language', () => {
    expect(typedTextOf(event([{ rangeOffset: 10, text: '>' }], 'json'))).toBeUndefined();
  });

  it('ignores an event with no change in it: that is metadata, not typing', () => {
    expect(typedTextOf(event([]))).toBeUndefined();
  });
});

describe('insertClosingTag', () => {
  const snippetOf = (text: string) => ({ text });

  const target = { uri: 'file:///x.fud', offset: 11, text: '</div>', version: 4 };

  const snippetEditor = (uri = 'file:///x.fud', version = 4) => {
    const calls: unknown[][] = [];
    return {
      calls,
      editor: {
        document: {
          version,
          uri: { toString: () => uri },
          positionAt: (offset: number) => offset,
        },
        insertSnippet: (snippet: unknown, location: unknown, options: unknown) => {
          calls.push([snippet, location, options]);
          return Promise.resolve(true);
        },
      },
    };
  };

  it('inserts the tag behind the caret', async () => {
    const { editor, calls } = snippetEditor();
    await insertClosingTag(editor, target, snippetOf);

    // `$0` first: the tabstop is what leaves the caret between the two tags.
    expect(calls).toEqual([
      [{ text: '$0</div>' }, 11, { undoStopBefore: false, undoStopAfter: true }],
    ]);
  });

  it('does nothing when the focus left the editor', async () => {
    await expect(insertClosingTag(undefined, target, snippetOf)).resolves.toBeUndefined();
  });

  it('does nothing when the focus moved to another file', async () => {
    const { editor, calls } = snippetEditor('file:///other.fud');
    await insertClosingTag(editor, target, snippetOf);

    expect(calls).toEqual([]);
  });

  it('does nothing when the user kept typing: a fast typist beats a round trip', async () => {
    const { editor, calls } = snippetEditor('file:///x.fud', 9);
    await insertClosingTag(editor, target, snippetOf);

    expect(calls).toEqual([]);
  });
});

describe('paths inside the installation', () => {
  it('finds the bundled server next to the extension', () => {
    expect(bundledServerPath('/ext')).toBe(join('/ext', 'dist', 'server.mjs'));
  });

  it("finds VS Code's own TypeScript under the app root", () => {
    expect(vscodeTsdkPath('/vscode')).toBe(
      join('/vscode', 'extensions', 'node_modules', 'typescript', 'lib'),
    );
  });
});
