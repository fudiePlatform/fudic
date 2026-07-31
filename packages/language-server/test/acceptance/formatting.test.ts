/**
 * SDD-26 acceptance criterion 11 — editor and CLI produce the same bytes.
 *
 * It can only be checked here, because this is the only place both paths exist. The server
 * answers `textDocument/formatting` over a live LSP connection; `fudic fmt` plans the same
 * files through `@fudic/cli`. If the two ever disagreed, the product would be broken in the
 * way §1 names: a file would change depending on whether it was saved or committed.
 */

import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DocumentFormattingRequest,
  DocumentOnTypeFormattingRequest,
  DocumentRangeFormattingRequest,
  type TextEdit,
} from 'vscode-languageserver-protocol';
import { planFmt } from '@fudic/cli';
import { FIXTURES } from '../_support.js';
import { fixtureText, startHarness, TSDK, type Harness } from './_harness.js';

/** The four `.fud` of the fixture workspace, as the index sees them. */
const FILES = [
  'blog/[slug].fud',
  'components/app-badge.fud',
  'components/site-nav.fud',
  'layouts/_layout.fud',
] as const;

/** Apply LSP edits to a text. One edit over the whole document is all this server sends. */
function applyEdits(text: string, edits: readonly TextEdit[] | null): string {
  if (edits === null || edits.length === 0) return text;
  const lines = text.split('\n');
  const offsetAt = (position: { line: number; character: number }): number => {
    let offset = 0;
    for (let i = 0; i < position.line; i += 1) offset += (lines[i]?.length ?? 0) + 1;
    return offset + position.character;
  };
  let out = text;
  for (const edit of [...edits].reverse()) {
    out = out.slice(0, offsetAt(edit.range.start)) + edit.newText + out.slice(offsetAt(edit.range.end));
  }
  return out;
}

/** What `fudic fmt` would write for each file of the fixture workspace. */
async function cliOutput(): Promise<ReadonlyMap<string, string>> {
  const plan = await planFmt(['.'], {
    cwd: FIXTURES,
    force: false,
    check: false,
    printWidth: 100,
    tabWidth: 2,
    useTabs: false,
    quote: 'double',
    endOfLine: 'lf',
  });
  const out = new Map<string, string>();
  for (const change of plan.changes) out.set(change.path, change.contents);
  return out;
}

describe('criterion 11 — the editor and the CLI are the same formatter', () => {
  let harness: Harness;
  let cli: ReadonlyMap<string, string>;

  beforeAll(async () => {
    harness = await startHarness({ tsdk: TSDK });
    cli = await cliOutput();
  }, 60_000);

  afterAll(async () => {
    await harness.stop();
  });

  it.each(FILES)('%s comes out identical from both paths', async (relative) => {
    const { uri, text } = await harness.open(relative);
    const edits = await harness.client.sendRequest(DocumentFormattingRequest.type, {
      textDocument: { uri },
      options: { tabSize: 2, insertSpaces: true },
    });
    const fromEditor = applyEdits(text, edits);
    // A file the CLI does not plan a change for is a file already in canonical form.
    expect(fromEditor).toBe(cli.get(relative) ?? text);
  });

  it('sends one edit over the whole document, or none at all', async () => {
    const { uri } = await harness.open('components/site-nav.fud');
    const edits = await harness.client.sendRequest(DocumentFormattingRequest.type, {
      textDocument: { uri },
      options: { tabSize: 2, insertSpaces: true },
    });
    expect(edits === null || edits.length <= 1).toBe(true);
  });

  it('answers with no edit at all for a file that is already formatted', async () => {
    // No edit, rather than an edit that replaces the file with itself: formatting on save must
    // not dirty a buffer nor push an entry onto the undo stack when there is nothing to do.
    const relative = 'layouts/_layout.fud';
    const { uri } = await harness.open(relative);
    const canonical = cli.get(relative) ?? fixtureText(relative);
    await harness.change(uri, canonical, 2);
    const edits = await harness.client.sendRequest(DocumentFormattingRequest.type, {
      textDocument: { uri },
      options: { tabSize: 2, insertSpaces: true },
    });
    expect(edits === null || edits.length === 0).toBe(true);
    await harness.change(uri, fixtureText(relative), 3);
  });

  it('answers nothing at all while the file does not parse', async () => {
    // "Format on save does nothing while the file is broken, silently" (§4.6).
    const { uri } = await harness.open('components/app-badge.fud');
    await harness.change(uri, '<app-badge>\n  <template shadowrootmode="open">\n    <p>x\n', 2);
    const edits = await harness.client.sendRequest(DocumentFormattingRequest.type, {
      textDocument: { uri },
      options: { tabSize: 2, insertSpaces: true },
    });
    expect(edits === null || edits.length === 0).toBe(true);
    await harness.change(uri, fixtureText('components/app-badge.fud'), 3);
  });
});

describe('range formatting and formatting while typing', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness({ tsdk: TSDK });
  }, 60_000);

  afterAll(async () => {
    await harness.stop();
  });

  it('formats the whole construct a half-selected header belongs to', async () => {
    const source = readFileSync(`${FIXTURES}/blog/[slug].fud`, 'utf8');
    const messy = source.replace('<article>', '<article   >');
    const { uri } = await harness.open('blog/[slug].fud', messy);

    const at = messy.indexOf('data.found');
    const edits = await harness.client.sendRequest(DocumentRangeFormattingRequest.type, {
      textDocument: { uri },
      range: {
        start: harness.positionAt(messy, at + 2),
        end: harness.positionAt(messy, at + 6),
      },
      options: { tabSize: 2, insertSpaces: true },
    });
    const out = applyEdits(messy, edits);
    // The `<app-badge>` was reached; the sloppy `<article   >` outside it was not.
    expect(out).toContain('<article   >');
  });

  it('reindents the line a closing brace was just typed on, and nothing else', async () => {
    const source = '@if (a) {\n  <p>x</p>\n      }\n';
    const { uri } = await harness.open('components/site-nav.fud', source);
    const edits = await harness.client.sendRequest(DocumentOnTypeFormattingRequest.type, {
      textDocument: { uri },
      position: harness.positionAt(source, source.indexOf('      }') + 7),
      ch: '}',
      options: { tabSize: 2, insertSpaces: true },
    });
    expect(applyEdits(source, edits)).toBe('@if (a) {\n  <p>x</p>\n}\n');
  });

  it('reindents nothing when the line is not a lone closer', async () => {
    const source = '<p>text</p>\n';
    const { uri } = await harness.open('components/site-nav.fud', source);
    const edits = await harness.client.sendRequest(DocumentOnTypeFormattingRequest.type, {
      textDocument: { uri },
      position: harness.positionAt(source, 11),
      ch: '>',
      options: { tabSize: 2, insertSpaces: true },
    });
    expect(edits === null || edits.length === 0).toBe(true);
  });
});
