/**
 * The conversions the adapter is not allowed to branch on (SDD-25 §5).
 */

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  bundledServerPath,
  commentSelectionOf,
  folderPaths,
  fudUriOf,
  insertClosingTag,
  replaceLines,
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

describe('commentSelectionOf', () => {
  const TEXT = '<app-x>\n  <p>hola</p>\n</app-x>';

  const selectionEditor = (languageId = 'fudic', text = TEXT, first = 1, last = 1) => ({
    document: {
      languageId,
      eol: 1,
      uri: { toString: () => 'file:///x.fud' },
      getText: () => text,
      offsetAt: ({ line, character }: { line: number; character: number }) =>
        text
          .split('\n')
          .slice(0, line)
          .reduce((total, own) => total + own.length + 1, 0) + character,
    },
    selection: { start: { line: first }, end: { line: last } },
    edit: () => Promise.resolve(true),
  });

  it('reads the lines and asks about the first thing written on the first one', () => {
    // The indent belongs to whatever came before the line: the `}` that closes `@code` is
    // still TypeScript, and the line after it is markup indented by nobody.
    expect(commentSelectionOf(selectionEditor())).toEqual({
      uri: 'file:///x.fud',
      lines: ['<app-x>', '  <p>hola</p>', '</app-x>'],
      firstLine: 1,
      lastLine: 1,
      offset: 10,
    });
  });

  it('splits on either line ending, so a CRLF file is not converted', () => {
    const selection = commentSelectionOf(selectionEditor('fudic', '<p>a</p>\r\n<p>b</p>'));

    expect(selection?.lines).toEqual(['<p>a</p>', '<p>b</p>']);
  });

  it('gives nothing when the focus is not on a .fud', () => {
    expect(commentSelectionOf(selectionEditor('json'))).toBeUndefined();
    expect(commentSelectionOf(undefined)).toBeUndefined();
  });

  it('survives a selection past the end of the text it was handed', () => {
    // The editor and the text are read one after the other, so a document that shrank between
    // the two is a state this can be in — and the answer has to be a position, not a throw.
    expect(commentSelectionOf(selectionEditor('fudic', '', 3, 3))?.firstLine).toBe(3);
  });
});

describe('replaceLines', () => {
  const editorWith = (text: string, eol: number) => {
    const edits: [unknown, string][] = [];
    return {
      edits,
      editor: {
        document: {
          languageId: 'fudic',
          eol,
          uri: { toString: () => 'file:///x.fud' },
          getText: () => text,
          offsetAt: () => 0,
        },
        selection: { start: { line: 0 }, end: { line: 0 } },
        edit: (build: (builder: { replace(range: unknown, replacement: string): void }) => void) => {
          build({ replace: (range, replacement) => edits.push([range, replacement]) });
          return Promise.resolve(true);
        },
      },
    };
  };

  const rangeOf = (a: number, b: number, c: number, d: number) => [a, b, c, d];
  const replacement = { firstLine: 0, lastLine: 1, newLines: ['x', 'y'] };

  it('replaces whole lines, to the end of the last one', () => {
    const { editor, edits } = editorWith('<p>a</p>\n<p>bb</p>', 1);
    void replaceLines(editor, replacement, rangeOf);

    expect(edits).toEqual([[[0, 0, 1, 9], 'x\ny']]);
  });

  it('joins with the ending the document already has', () => {
    // Joining with `\n` on a Windows file would make the diff of a comment toggle the whole
    // selection, and the file mixed.
    const { editor, edits } = editorWith('<p>a</p>\r\n<p>bb</p>', 2);
    void replaceLines(editor, replacement, rangeOf);

    expect(edits[0]?.[1]).toBe('x\r\ny');
  });

  it('does nothing when the focus left the editor', async () => {
    await expect(replaceLines(undefined, replacement, rangeOf)).resolves.toBeUndefined();
  });

  it('ends at column zero when the last line is past the end of the text', async () => {
    const { editor, edits } = editorWith('', 1);
    await replaceLines(editor, replacement, rangeOf);

    expect(edits[0]?.[0]).toEqual([0, 0, 1, 0]);
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
