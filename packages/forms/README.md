# @fudic/forms

The form model of fudic: controls, groups and validation. **No DOM in any branch** —
the same schema runs in the browser, in the prerender and on the server.

```ts
import { form, control, group, required, minLength } from '@fudic/forms';

const schema = {
  title: control('', [required, minLength(3)]),
  published: control(false),
  seo: group({
    description: control(''),
    canonical: control(''),
  }),
};

const f = form(schema);

f.title.set('Hello');
f.title();             // 'Hello'  — read by calling, like a signal
f.seo.description();   // ''       — a group is a nested form

await f.$validate();   // true
f.$value();            // { title: 'Hello', published: false, seo: { … } }
```

## Reading

Everything is read by calling it: the value, `errors`, `touched` and `dirty`. Reads are
tracked, so an `effect` that reads a control re-runs when it moves.

```ts
import { effect } from '@fudic/core';

effect(() => console.log(f.title(), f.title.errors()));
```

## Writing

Two operations, deliberately named apart:

```ts
f.$set({ title: 'A', published: true, seo: { … } });  // total: a missing field throws
f.$patch({ title: 'A' });                             // partial: nothing else is touched
```

`$set` refuses an incomplete object instead of emptying the fields you left out — which
is what a `PATCH` body carrying three fields of twelve would otherwise do.

## Validating

Validators run in declaration order and stop at the first failure, so a field has *one*
error, not a list. They may be async.

```ts
const f = form(schema, {
  summary: (root) => (root.published() && !root.seo.description() ? { seo: true } : null),
});

await f.$validate();              // client rules only
await f.$validate({ server: true });  // plus the ones built with serverValidator
```

Errors that arrive from outside — a 422 — go in by path:

```ts
f.$setErrors({ 'seo.canonical': { protocol: true } });
```

An overtaken async validation never publishes: each control carries an epoch, so a slow
rule cannot paint the error of a value the user already changed.

## The schema is a template

`form(schema)` **clones** its nodes, so a schema declared at module scope can be shared
by both ends and instantiated per request without sharing state.

## Typed controls

A declared type is a range, so it validates — with JSON as much as with a binary wire:

```ts
import { u8, u32, str, arr } from '@fudic/forms';

const line = { qty: u32(1), vatPct: u8(21), note: str(''), tags: arr(str, []) };
```

Each type is its own export. Import none and none reaches your bundle.

## Scripts

```sh
pnpm --filter @fudic/forms test
pnpm --filter @fudic/forms typecheck
pnpm --filter @fudic/forms coverage
```
