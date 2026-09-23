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

A single control validates on its own, against the root of the form it belongs to:

```ts
await f.title.validate();   // false — and only f.title's error changes
```

When a bound field validates itself is `validateOn`, flags you combine. The submit always
validates; the flags add the moments before it:

```ts
import { ValidateOn } from '@fudic/forms';

const f = form(
  {
    alias: control('', [required, minLength(3)]),                          // the form's: Blur
    email: control('', [required], { validateOn: ValidateOn.Blur | ValidateOn.Input }),
  },
  { validateOn: ValidateOn.Blur },
);
```

`Blur` validates on leaving the field. `Input` validates on every edit once the field has been
left once — never while it is typed for the first time. `Submit` (zero) waits for the submit.
A control's own option wins over the nearest form's; with none, `Blur | Input`.

## Messages

A rule returns what failed — `{ minLength: 3 }` — never a sentence. The sentence comes from
the control first, then from the application's defaults, then falls back to the rule code:

```ts
import { setMessages } from '@fudic/forms';

setMessages({ required: () => 'Required.' });

const f = form({
  alias: control('', [required, minLength(3)], {
    messages: { minLength: (n) => `At least ${String(n)} characters.` },
  }),
});

f.alias.message();   // '' until validated, then the text of its current error
f.$message();        // the same for the form's summary (`form(schema, { messages })`)
```

## In a template

`control=` binds an element to a node and `error=` marks the element that shows its
message — any element, anywhere in the same block:

```html
<form control=@f>
  <input control=@f.alias>
  <small class="error" error=@f.alias></small>
  <div error=@f></div>   <!-- the summary: a polite live region -->
</form>
```

The compiler adds the `id` and the `aria-describedby`; without a marker no message element
exists. A field's error follows its `validateOn`, and a submit validates before deciding — an
invalid form never goes out, and the author's own `@submit` sees `defaultPrevented`. A bound
`<form>` gets `novalidate`: the browser's own bubbles would stop the submit before this
validation runs. Inside a control-component, put the marker
in its own template: `aria-describedby` does not cross a shadow root.

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
