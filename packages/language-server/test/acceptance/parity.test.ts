/**
 * SDD-35 §6.3 — THE criterion: what the editor marks and what the build reports are one set.
 *
 * One corpus, two roads. Each case is written to a private copy of the fixture workspace and
 * then asked of both: the live language server, over LSP, for every `.fud` of the workspace;
 * and `createProjectChecker`, the check `vite build` runs. The `error` and `warning`
 * diagnostics of the two must be the same set — file, span, code and severity.
 *
 * It lives here and not in `@fudic/typecheck` because it needs the server, and the server
 * depends on that package: the other way round would be a dependency cycle.
 *
 * A difference here is a defect of the move to `@fudic/typecheck` (SDD-35 §4.1) and is fixed
 * there, never by loosening this comparison.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { URI } from 'vscode-uri';
import {
  DidChangeWatchedFilesNotification,
  DocumentDiagnosticRequest,
  FileChangeType,
  type Diagnostic,
  type FullDocumentDiagnosticReport,
} from 'vscode-languageserver-protocol/node';
import { createProjectChecker, toPosix, type ProjectChecker } from '@fudic/typecheck';
import { copyWorkspace, startHarness, type Harness } from './_harness.js';

const SLUG = 'blog/[slug].fud';
const BADGE = 'components/app-badge.fud';
const NAV = 'components/site-nav.fud';
const LAYOUT = 'layouts/_layout.fud';
const FILES = [SLUG, BADGE, NAV, LAYOUT] as const;

let root: string;
let harness: Harness;
let checker: ProjectChecker;
let version = 1;
const original = new Map<string, string>();

beforeAll(async () => {
  root = copyWorkspace();
  for (const file of FILES) original.set(file, readFileSync(`${root}/${file}`, 'utf8'));
  harness = await startHarness({ root });
  for (const file of FILES) await harness.open(file);
  checker = createProjectChecker({ root });
}, 120_000);

afterAll(async () => {
  await harness.stop();
});

/** A diagnostic as both roads can spell it: `path|start|end|code|severity`. */
type Key = string;

const key = (file: string, start: number, end: number, code: string, severity: string): Key =>
  `${file}|${start}|${end}|${code}|${severity}`;

/** Offset of an LSP position in `text`. */
function offsetAt(text: string, position: { line: number; character: number }): number {
  let offset = 0;
  for (let line = 0; line < position.line; line++) offset = text.indexOf('\n', offset) + 1;
  return offset + position.character;
}

/** What the editor shows, in red and yellow, for every `.fud` of the workspace. */
async function editorSet(texts: ReadonlyMap<string, string>): Promise<Set<Key>> {
  const found = new Set<Key>();
  for (const file of FILES) {
    const report = (await harness.client.sendRequest(DocumentDiagnosticRequest.type, {
      textDocument: { uri: harness.uriOf(file) },
    })) as FullDocumentDiagnosticReport;
    const text = texts.get(file)!;
    for (const item of report.items as Diagnostic[]) {
      const severity = item.severity ?? 1;
      if (severity > 2) continue;
      const code = typeof item.code === 'number' ? `TS${item.code}` : String(item.code);
      found.add(
        key(file, offsetAt(text, item.range.start), offsetAt(text, item.range.end), code, severity === 1 ? 'error' : 'warning'),
      );
    }
  }
  return found;
}

/** What the build reports. */
function buildSet(changed: readonly string[]): Set<Key> {
  for (const file of changed) checker.invalidate(`${root}/${file}`);
  const report = checker.check();
  expect(report.project).toEqual([]);
  const base = toPosix(URI.file(root).fsPath).toLowerCase();
  return new Set(
    report.problems.map((problem) =>
      key(
        toPosix(problem.file).slice(base.length + 1),
        problem.span.start,
        problem.span.end,
        problem.code,
        problem.severity,
      ),
    ),
  );
}

/**
 * Tell the server a file was saved, as the editor's watcher does: the index reads what OTHER
 * files declare — a layout's holes, a component's tag — from the disk, not from an open buffer.
 */
async function saved(file: string): Promise<void> {
  await harness.client.sendNotification(DidChangeWatchedFilesNotification.type, {
    changes: [{ uri: harness.uriOf(file), type: FileChangeType.Changed }],
  });
}

/**
 * Write `edits` to disk and to the editor, ask both roads, and put everything back.
 * Returns the build's set, after asserting it is the editor's.
 */
async function parity(edits: Readonly<Record<string, (text: string) => string>>): Promise<string[]> {
  const texts = new Map(original);
  for (const [file, edit] of Object.entries(edits)) {
    const text = edit(original.get(file)!);
    expect(text, `the edit of ${file} changed nothing`).not.toBe(original.get(file));
    texts.set(file, text);
    writeFileSync(`${root}/${file}`, text);
    await harness.change(harness.uriOf(file), text, ++version);
    await saved(file);
  }

  try {
    const editor = await editorSet(texts);
    const build = buildSet(Object.keys(edits));
    expect([...build].sort()).toEqual([...editor].sort());
    return [...build].sort();
  } finally {
    for (const file of Object.keys(edits)) {
      writeFileSync(`${root}/${file}`, original.get(file)!);
      await harness.change(harness.uriOf(file), original.get(file)!, ++version);
      await saved(file);
      checker.invalidate(`${root}/${file}`);
    }
  }
}

/** The codes of a set, for the assertion that a case reports what it is about. */
const codes = (set: readonly string[]): string[] => set.map((entry) => entry.split('|')[3]!);

const replace = (from: string, to: string) => (text: string): string => text.replace(from, to);

describe('SDD-35 §6.3 — parity between the editor and the build', () => {
  it('the clean corpus: nothing on either side', async () => {
    expect(await parity({})).toEqual([]);
  });

  describe('the mutants A–I of SDD-23 §6.2', () => {
    it('A — a value outside the prop union', async () => {
      expect(codes(await parity({ [SLUG]: replace(`tone=@(data.found ? 'info' : 'neutral')`, `tone=@('bogus')`) }))).toEqual([
        'TS2322',
      ]);
    });

    it('B — a @server symbol used in the template', async () => {
      expect(codes(await parity({ [SLUG]: replace('<h1>@data.title</h1>', '<h1>@findPost</h1>') }))).toEqual(['TS2304']);
    });

    it('C — a section the layout does not declare', async () => {
      expect(codes(await parity({ [SLUG]: replace('@section nav {', '@section footer {') }))).toEqual(['TS2345']);
    });

    it('D — a tag with no <link>', async () => {
      const set = await parity({
        [SLUG]: (text) => text.replace('<app-badge .tone', '<app-missing .tone').replace('</app-badge>', '</app-missing>'),
      });
      expect(new Set(codes(set))).toEqual(new Set(['FUD0191', 'TS2304']));
    });

    it('E — interpolating an object', async () => {
      expect(codes(await parity({ [SLUG]: replace('<h1>@data.title</h1>', '<h1>@data</h1>') }))).toEqual(['TS2345']);
    });

    it('F — a misspelt attribute', async () => {
      expect(codes(await parity({ [SLUG]: replace('<site-nav .current=', '<site-nav .currnt=') }))).toEqual(['TS2561']);
    });

    it('G — narrowing inside @if reports nothing', async () => {
      expect(
        await parity({
          [SLUG]: replace(
            '  <p>@data.body</p>',
            '  <p>@data.body</p>\n  @if (data.note !== undefined) {\n    <p>@(data.note.toUpperCase())</p>\n  }',
          ),
        }),
      ).toEqual([]);
    });

    it("H — changing load()'s contract breaks the template", async () => {
      expect(codes(await parity({ [SLUG]: replace('Promise<PageData> {', 'Promise<Omit<PageData, "body">> {') }))).toContain(
        'TS2339',
      );
    });

    it('I — the item of a @foreach carries its type', async () => {
      const set = await parity({
        [SLUG]: (text) =>
          text
            .replace('  type PageData', '  const xs = [{ ok: 1 }];\n  type PageData')
            .replace('  <p>@data.body</p>', '  <p>@data.body</p>\n  @foreach (const it of xs) {\n    <span>@it.nope</span>\n  }'),
      });
      expect(codes(set)).toContain('TS2339');
    });
  });

  describe('the two literals of a component tag (BUG-16 §6.14)', () => {
    it('the global vocabulary of HTML is not an error', async () => {
      expect(
        await parity({
          [SLUG]: replace('<app-badge .tone', '<app-badge id="b" class="x" role="note" data-k="1" aria-label="badge" .tone'),
        }),
      ).toEqual([]);
    });

    it('a prop written as a plain attribute', async () => {
      expect(codes(await parity({ [SLUG]: replace('<app-badge .tone', '<app-badge tone="info" .tone') }))).toEqual(['TS2353']);
    });

    it('a misspelt global', async () => {
      expect(codes(await parity({ [SLUG]: replace('<app-badge .tone', '<app-badge titel="b" .tone') }))).toEqual(['TS2561']);
    });
  });

  it('inter-file (SDD-24 §6.9): changing Tone breaks the page that was not touched', async () => {
    const set = await parity({
      [BADGE]: replace(`type Tone = 'neutral' | 'success' | 'info';`, `type Tone = 'neutral';`),
    });
    expect(set.some((entry) => entry.startsWith(`${SLUG}|`) && entry.includes('|TS2322|'))).toBe(true);
  });

  it('FUD0461 (SDD-24 §6.11): a $ identifier in @client', async () => {
    const set = await parity({ [BADGE]: replace('@code {', '@code {\n  @client {\n    const $x = 1;\n  }\n') });
    expect(codes(set)).toContain('FUD0461');
  });

  it('a syntax error', async () => {
    const set = await parity({ [SLUG]: replace('<article>', '<article>\n  <div>') });
    expect(codes(set)).toContain('FUD0052');
  });

  it('an Oxc syntax error inside @code', async () => {
    const set = await parity({ [BADGE]: replace('@code {', '@code {\n  @client {\n    const = ;\n  }\n') });
    expect(codes(set)).toContain('FUD0170');
  });

  it('a required section left unfilled (SDD-48)', async () => {
    const set = await parity({
      [LAYOUT]: replace('@RenderSection(nav)', '@RenderSection(nav)\n      @RenderSection(aside, required: true)'),
    });
    expect(set).toEqual([`${SLUG}|0|49|FUD0890|error`]);
  });

  it('an href that resolves to nothing (FUD0460)', async () => {
    const set = await parity({ [SLUG]: replace('../components/app-badge.fud', '../components/app-ghost.fud') });
    expect(codes(set)).toContain('FUD0460');
  });

  describe('the cases FUD0197–FUD0199 used to report, now TypeScript’s (SDD-35 §4.7)', () => {
    it('a required prop nobody passes (was FUD0197)', async () => {
      const set = await parity({ [NAV]: replace(`props<{ current?: string }>()`, `props<{ current?: string; label: string }>()`) });
      expect(codes(set)).toEqual(['TS2345']);
    });

    it('a prop that does not exist (was FUD0198)', async () => {
      const set = await parity({ [SLUG]: replace('<site-nav .current=', '<site-nav .nope=') });
      expect(codes(set)).toEqual(['TS2353']);
    });

    it('a slot the child does not declare (was FUD0199)', async () => {
      const set = await parity({ [SLUG]: replace('>@data.tag</app-badge>', '><b slot="meta">x</b></app-badge>') });
      expect(codes(set)).toEqual(['TS2345']);
    });
  });
});
