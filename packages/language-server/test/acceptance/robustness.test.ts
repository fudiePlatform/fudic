/**
 * Criteria §6.13 and §6.14: what happens when the workspace changes under the server, and what
 * happens when the user types faster than it can answer.
 *
 * Neither is about a feature — both are about the server staying honest while in motion. The
 * first writes a real file to disk and notifies the watcher, because the point of the criterion
 * is that no restart is needed. The second is measured with the counter of §6.14 and never with
 * a clock: a criterion in milliseconds is a criterion that fails in CI on a busy machine.
 *
 * The rest of the moving parts live next door: §6.11 (`$` while typing) and §6.12 (an unclosed
 * `<div>`) are in `diagnostics.test.ts`, and §6.10 (CSS) is in `completion.test.ts`.
 */

import { rmSync, writeFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CancellationTokenSource,
  CompletionRequest,
  DidChangeWatchedFilesNotification,
  DocumentDiagnosticRequest,
  FileChangeType,
  type CompletionList,
  type Diagnostic,
  type FullDocumentDiagnosticReport,
} from 'vscode-languageserver-protocol/node';
import { URI } from 'vscode-uri';
import { copyWorkspace, fixtureText, startHarness, type Harness } from './_harness.js';

const SLUG = 'blog/[slug].fud';

/** A component the workspace does not have yet: the file criterion §6.13 is about. */
const CARD_SOURCE = `@code {
  const { title = '' } = props<{ title?: string }>();
}

<app-card>
  <template shadowrootmode="open"><span>@title</span></template>
</app-card>
`;

/** `[slug].fud` as it would be after `fudic g component app-card` and one `<link>` more. */
const SLUG_USING_CARD = fixtureText(SLUG)
  .replace(
    '<link rel="component" href="../components/app-badge.fud">',
    '<link rel="component" href="../components/app-badge.fud">\n<link rel="component" href="../components/app-card.fud">',
  )
  .replace('<h1>@data.title</h1>', '<h1>@data.title</h1>\n  <app-card title="x"></app-card>');

let harness: Harness;
let version = 1;
/** Path of the component this file creates and deletes, inside its private workspace. */
let cardPath: string;

beforeAll(async () => {
  // A workspace of its own: this is the only acceptance file that writes `.fud` files, and the
  // others assert over a workspace of exactly four documents while running in parallel.
  harness = await startHarness({ root: copyWorkspace() });
  cardPath = `${harness.root}/components/app-card.fud`;
  await harness.open(SLUG);
  await harness.open('components/app-badge.fud');
  await harness.open('components/site-nav.fud');
  await harness.open('layouts/_layout.fud');
}, 60_000);

afterAll(async () => {
  await harness.stop();
  rmSync(cardPath, { force: true });
});

/** Re-write a document and pull its diagnostics, errors and warnings only. */
async function diagnosticsOf(uri: string, text: string): Promise<Diagnostic[]> {
  await harness.change(uri, text, ++version);
  const report = (await harness.client.sendRequest(DocumentDiagnosticRequest.type, {
    textDocument: { uri },
  })) as FullDocumentDiagnosticReport;
  return report.items.filter((item) => (item.severity ?? 1) <= 2);
}

/** Tell the server what the filesystem just did, as the editor's watcher would. */
async function watched(path: string, type: FileChangeType): Promise<void> {
  await harness.client.sendNotification(DidChangeWatchedFilesNotification.type, {
    changes: [{ uri: URI.file(path).toString(), type }],
  });
}

describe('§6.13 — invalidation', () => {
  it('a .fud created on disk makes its tag resolve, and deleting it makes it stop', async () => {
    const { uri } = await harness.open(SLUG, SLUG_USING_CARD);

    // Before the file exists: the href resolves to nothing (FUD0460), the tag is undeclared
    // (FUD0191, decision 41) and the projection cannot name it (TS2304).
    const missing = await diagnosticsOf(uri, SLUG_USING_CARD);
    expect(new Set(missing.map((item) => item.code))).toEqual(
      new Set(['FUD0460', 'FUD0191', 2304]),
    );

    writeFileSync(cardPath, CARD_SOURCE);
    await watched(cardPath, FileChangeType.Created);

    // The same server, the same session, the same open document: nothing was restarted, and
    // the three errors are gone — including the one that came from the type checker, which
    // means the new file entered the program too.
    expect(await diagnosticsOf(uri, SLUG_USING_CARD)).toEqual([]);

    // Completion sees it as well: the index is what both features read.
    const answer = (await harness.client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: harness.positionAt(SLUG_USING_CARD, SLUG_USING_CARD.indexOf('<app-card title') + 1),
    })) as CompletionList;
    const ours = answer.items.filter((item) => item.labelDetails?.description === 'fudic component');
    expect(ours.map((item) => item.label).sort()).toEqual(['app-badge', 'app-card', 'site-nav']);

    rmSync(cardPath, { force: true });
    await watched(cardPath, FileChangeType.Deleted);

    // And back: invalidation is not a one-way door, and a deleted component is a broken link
    // again rather than a stale entry pointing at a file that is not there.
    expect(new Set((await diagnosticsOf(uri, SLUG_USING_CARD)).map((item) => item.code))).toEqual(
      new Set(['FUD0460', 'FUD0191', 2304]),
    );
  });
});

describe('§6.14 — cancellation', () => {
  it('a burst of edits leaves exactly one request completed', async () => {
    const source = fixtureText(SLUG);
    const { uri } = await harness.open(SLUG, source);
    // Inside the `href` of the layout link: a position this server answers itself, so every
    // request that reaches the work is a request the counter sees.
    const position = harness.positionAt(source, source.indexOf('href="../layouts') + 6);

    const before = harness.server.stats.completed;
    const BURST = 5;

    const sources = Array.from({ length: BURST }, () => new CancellationTokenSource());
    const pending: Promise<unknown>[] = [];

    // The server is held at the pipe while the burst is written, which is what makes this a
    // measurement and not a race: every edit and every request of the burst is unread when the
    // cancellations arrive, exactly as they are when someone types faster than a typecheck.
    // Without it the count would depend on how fast the machine is, and §6.14 says explicitly
    // that a criterion measured by the clock is not one.
    harness.pause();

    for (const [i, token] of sources.entries()) {
      // Each edit is a new version, exactly as typing is: the request that follows is about a
      // document that the next keystroke is already making obsolete.
      pending.push(harness.change(uri, `${source}\n<!-- ${i} -->`, ++version));
      pending.push(
        harness.client
          .sendRequest(CompletionRequest.type, { textDocument: { uri }, position }, token.token)
          .catch(() => undefined),
      );
    }

    // The rest: everything but the last request is abandoned, which is what an editor does when
    // the answer it asked for is about text that no longer exists.
    for (const token of sources.slice(0, -1)) token.cancel();

    harness.resume();
    await Promise.all(pending);

    // One region of rest, one completed request. The other four never did the work: the token
    // was already cancelled, so the burst cost one answer instead of five.
    expect(harness.server.stats.completed - before).toBe(1);
  });

  it('counts a request cancelled before its work as cancelled, not as completed', async () => {
    // The counter's other half, over the real connection: a token already cancelled when the
    // handler runs must be counted as cancelled and must not answer. This is the guard that
    // matters once a request is already in flight — the connection can only drop the ones it
    // has not dispatched yet.
    const stats = harness.server.stats;
    const before = { completed: stats.completed, cancelled: stats.cancelled };
    const token = new CancellationTokenSource();
    token.cancel();

    expect(stats.run(token.token, () => 'answer', undefined)).toBeUndefined();
    expect(stats.cancelled - before.cancelled).toBe(1);
    expect(stats.completed - before.completed).toBe(0);
  });
});
