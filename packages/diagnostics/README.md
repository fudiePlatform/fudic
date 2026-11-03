# `@fudic/diagnostics`

Every fudic diagnostic: one typed function per `FUD` code, its explanation beside it, and the
one place an offset becomes a line. No runtime dependencies.

## A code

```ts
import { FUD0540 } from '@fudic/diagnostics';

report(FUD0540({ span }));
// { code: 'FUD0540', severity: 'error', message: "a loop must declare 'key (…)'", span }
```

The severity and the message belong to the code, never to the call. No package writes a
`'FUDnnnn'` string by hand: it calls the code's function.

## The catalogue

`src/codes/` is the catalogue. A live code is a `FUDnnnn.ts` (its function), a `FUDnnnn.md` (its
explanation) and a line in `src/index.ts`. A retired code is only a `.md` that says so; its number
is never reused.

Every `.md` has the same closed shape:

```md
# FUD0540 — Loop without `key (…)`
**error**

Every `@foreach`, `@for` and `@while` declares the identity of its rows, so an update can keep, move or drop each one instead of rebuilding the list.
**Fix:** add a key after the header: `@foreach (const item of items) key (item.id) { … }`.
```

1. `# FUDnnnn — <title>`.
2. `**<severity>**` alone: `error`, `warning`, `info`, `hint` or `retired`.
3. A blank line.
4. Why: one or more lines of text.
5. Last: `**Fix:** …` for a live code, `**Replaced by:** …` for a retired one. Nothing after it.

Every fix that shows code is proven by a pair in `fixtures/`: `FUDnnnn.fud` gives that code, and
`FUDnnnn.fixed.fud`, the fix applied, gives nothing. A pair that needs other files is a folder,
`fixtures/FUDnnnn/`.

## Reading an explanation

```ts
import { explain } from '@fudic/diagnostics/explain';

explain('FUD0540');
// { code: 'FUD0540', title: 'Loop without `key (…)`', severity: 'error', why: '…', fix: '…' }
explain('FUD1000'); // retired: { …, severity: 'retired', replacedBy: '…' }
explain('FUD9999'); // undefined
```

`explain` never throws: a code with no `.md`, or a string that is not a code, is `undefined`.
`explanationFile(code)` is where the `.md` is on disk, for an editor that opens it. The subpath
needs Node; nothing that runs in a browser imports it.
