# `@fudic/history`

The history of each piece of a fudic app. Next to every component and every route lives a
`.fudlog` that only grows: who approved its criteria, every run of its tests and criteria with
its result, what the client accepted. Each line carries the hash of what went in, so you can
tell whether an approval or a green run still holds.

```
2026-10-22T10:20Z d4e5f6a approved    by pedro  spec 4 hash 2b8f3c91aa04
2026-10-22T10:48Z 7f6e5d4 spec_run    fail 3/4  hash 4471a0c2be6d  disabled-no-press
2026-10-22T10:52Z 3c2b1a0 tests       pass 6/6  hash 5e7a90c3d211
2026-10-22T11:06Z 9d8c7b6 done
```

A line is the UTC minute, the short `HEAD` (`-------` outside git), the event and its fields.
Add `*.fudlog merge=union` to your `.gitattributes` (`fudic new` does) so two branches that add
lines join without a conflict.

## Reading and writing

```ts
import { parseHistory, record } from '@fudic/history';

await record('src/components/acme-button/acme-button.fud', { kind: 'done' });

const { value: lines, diagnostics } = parseHistory(text, file);
```

`parseHistory` never throws: a line it cannot read is a `FUD1220` warning and is skipped. Lines
come sorted by instant.

## Is it still valid?

```ts
import { unitState } from '@fudic/history';

const state = await unitState('src/components/acme-button/acme-button.fud');
state.approval; // 'none' | 'valid' | 'expired'
state.tests;    // { state: 'pass', passed: 6, total: 6 } | { state: 'stale', last: 'pass' } | { state: 'not run' }
```

Two hashes decide it. The approval hash covers the `.fudspec` and its fixture. The input hash
covers everything that can change a result: the piece's siblings (`.fud`, `.fudspec`,
`.fixture.ts`, `.test.ts`, `.fudapi`), every `.fud` it links and its `.fudapi`, and every module
of the project it imports, transitively. Published packages are left out; workspace libraries
are in. Line endings and path separators do not change a hash.

## Recording runs

```ts
import { recordSpecRun, recordTestRun, snapshot } from '@fudic/history';
import { runTests } from '@fudic/testing/run';

const before = await snapshot(['src/components/acme-button/acme-button.fud']);
const report = await runTests({ root });
await recordTestRun(report, before);
```

Take the snapshot before running: the line records what was tested, even if a file is saved
while the run goes on. Only the pieces in the snapshot are recorded.

## Files, clock and git

Every function takes an optional `HistoryIo` last: `nodeIo(root)` is the disk under the project
root, and a test can pass its own to fix the clock and the commit.
