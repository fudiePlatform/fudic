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

## A project's policy

A project decides in `fudic.json` how each code is reported, and a file silences a line or itself
with a comment. Neither changes a code's severity: they change how it is reported, and the message
says so — `… (warning by default; error in this project)`.

```jsonc
"diagnostics": { "FUD1380": "off", "FUD1022": "error", "warnings": "error" }
```

```
@* fud-disable FUD1380: why *@                 the whole file, wherever it is
/* fud-disable-next-line FUD1524: why */       the line after the comment
```

A code's own entry beats `warnings`. An error is never lowered nor silenced (`FUD1521`), a comment
needs codes and a reason (`FUD1522`), an unknown or retired code is `FUD1520`, and a comment that
silenced nothing is `FUD1523`.

```ts
import { govern } from '@fudic/diagnostics';

govern(diagnostics, policy, comments, lines, { complete: true });
```

`govern` is the one call every place that shows a diagnostic to a person makes: it reads the
directives out of the file's comments (`readSuppressions`), applies the policy (`applyPolicy`) and,
when it holds every diagnostic of the file (`complete`), adds a `FUD1523` per unused comment. Each
comment's `text` carries its delimiters, so a code inside it is underlined on its own.

`codeInfo(code)` and `liveCodes()` read the catalogue as data — the policy needs a code's severity
before any diagnostic of it exists. They come from `src/catalog.generated.ts`, written from the
`.md` files by `pnpm --filter @fudic/diagnostics catalog`; a test compares it with the folder.
