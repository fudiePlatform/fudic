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

A field's validators run in declaration order and stop at the first failure, so a field has
*one* error, not a list. They may be async.

The **summary** is different: the errors that belong to no single field. A form's `summary`
rule and a group's rules (its second argument) **all** run, and a summary says every failure
at once — `$summary()` is the union of their errors, the first rule winning a repeated key.

```ts
const f = form(schema, {
  summary: (root) => {
    const found: Record<string, true> = {};
    if (root.published() && !root.seo.description()) found.seo = true;
    if (root.title() === root.seo.canonical()) found.sameUrl = true;
    return Object.keys(found).length > 0 ? found : null;   // both can fail together
  },
});

await f.$validate();              // client rules only
await f.$validate({ server: true });  // plus the ones built with serverValidator
```

A group takes the same options a form does, minus `summary` — its rules already are its
summary:

```ts
acceso: group(
  { clave: control('', [required]), repetir: control('', [required]) },
  [(v) => (v.clave === v.repetir ? null : { mismatch: true })],
  { messages: { mismatch: () => 'The passwords do not match.' } },   // GroupOptions
),
```

`GroupOptions` is `messages`, `validateOn` and `validity`; the last two are inherited by its
controls exactly as from a nested form.

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

## Validity

**Errors** are what the user is *shown*, governed by `touched` and `validateOn`. **Validity**
is whether the current values satisfy the rules, and it is silent: reading it never publishes
an error, never touches a field and never changes a marker.

```ts
f.alias.valid();   // a control
f.$valid();        // a form or a group: every child valid, and its own rules satisfied
```

Both are tracked (`computed`), so `disabled=@(!f.$valid())` follows the values by itself —
including the field a cross-field rule reads. A 422 set with `$setErrors` keeps a control
invalid until its value changes.

What counts is a policy, set like `validateOn` (control → nearest form or group →
`Interacted`):

```ts
import { Validity } from '@fudic/forms';

form(schema, { validity: Validity.Rules });
```

- `Validity.Interacted` (the default): a control counts once the user has left it or changed
  it. A fresh form is valid, and a disabled submit is enabled on arrival.
- `Validity.Rules`: every rule counts from the start. A fresh form with an empty `required` is
  invalid, and the button is born disabled.

`valid()` never *calls* an asynchronous rule — reading it in a view would put a request on the
wire at every keystroke. Mark such a rule with `asyncValidator`, and the validity reads its
verdict for the current value instead, or counts it as pending:

```ts
import { asyncValidator } from '@fudic/forms';

control('', [asyncValidator(async (v) => ((await taken(v)) ? { taken: true } : null))]);
```

An unmarked rule that answers with a promise counts as pending too, and never settles: a button
that never enables is the visible failure that leads to marking it. `serverValidator` rules do
not run in the client at all; their verdict arrives with the 422.

Two consequences to know before disabling a submit with `$valid()`:

- **A disabled button means no submit**, so nothing touches the fields or moves the focus.
  With the defaults (`Blur`, `Interacted`) this is harmless: a field only counts once left, and
  leaving it already paints its message. With `Validity.Rules`, say *why* the button is
  disabled somewhere the user can read it.
- **`ValidateOn.Submit` + an `asyncValidator` rule + a button disabled by `$valid()`** is a
  deadlock: the rule only runs on the submit, the submit never happens, and the control stays
  pending forever.

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
f.$messages();       // every text of the form's summary, in rule and key order, or []
f.$message();        // the first of them, or ''
```

A summary's texts use the same chain: the form's or group's own `messages`, then
`setMessages`, then the code.

What a summary with `fields` paints is `$issues()`: the node's own texts (path `''`) and,
after a submit attempt, the visible error of every field below it, in declaration order, a
group's own texts ahead of its fields. `$submitted()` says whether there was an attempt; the
DOM binding sets it on each submit, and `$reset` and `$set` clear it.

```ts
f.$issues();   // [{ path: '', message: '…' }, { path: 'alias', message: 'Pick an alias.' }]
```

## In a template

Three reserved attributes:

| Attribute | Names | Paints |
|---|---|---|
| `control=@node` | any node | binds the element to it |
| `error=@control` | a **control** | its message once touched, as text |
| `summary=@form` | a **form or a group** | a list: `$messages()`, or `$issues()` with `fields` |

```html
<form control=@f>
  <div class="summary" summary=@f fields></div>
  <label for="ali">Alias <span aria-hidden="true">*</span></label>
  <input id="ali" control=@f.alias>
  <small class="error" error=@f.alias></small>
  <fieldset control=@f.acceso>
    <div class="summary" summary=@f.acceso></div>   <!-- "The passwords do not match." -->
    …
  </fieldset>
  <button type="submit" disabled=@(!f.$valid())>Save</button>
</form>
```

The compiler adds the `id` and the `aria-describedby`; without a marker no message element
exists. `error=` on a form or a group is `FUD0600` (use `summary=`), and `summary=` on a
control is `FUD0601` (use `error=`). A field's error follows its `validateOn`, and a submit
validates before deciding — an invalid form never goes out, and the author's own `@submit`
sees `defaultPrevented`. A bound `<form>` gets `novalidate`: the browser's own bubbles would
stop the submit before this validation runs.

**A summary is a list.** Empty — no children, so `:empty` hides it — or a `<ul>` with one
`<li>` per text, written the same byte for byte by the server and by the client. Its element
gets `aria-live="polite"`, on a form and on a group, unless the author wrote one. Since it holds
a `<ul>`, it cannot be an element that forbids one (`<p>`, `<span>`, `<small>`, `<label>`…:
`FUD0602`). Want another layout? Read `$messages()` or `$issues()` and write it with `@foreach`.

**`fields`** is the *error summary* pattern. After a failed submit the summary also lists each
field's error as a link to its field, and the focus goes to the summary instead of the first
field. Following a link focuses the field and scrolls it into view; correcting the field takes
its entry out on that same keystroke. The compiler gives the summary `tabindex="-1"`, gives a
bound field with no `id` a derived one to link to, and points every field with no marker of its
own at its entry with `aria-describedby`. A field with its own marker shows its error in both
places, which is what GOV.UK recommends; drop the marker to have it only in the summary.

The `*` of a required field goes in `aria-hidden`: it is a visual mark, not part of the name.
Without it a screen reader says *"Name star"*.

### Four ways to write a field

| Pattern | Name | Description | Clicking the label |
|---|---|---|---|
| Native: `<label for>` + `<input>` + `<small error=>` | `<label for>` | the compiler's `aria-describedby` | native |
| `<label for>` + `app-input` + `app-error` | the bridge, or the fallback | the relay | native: `delegatesFocus` |
| `app-label` + `app-input` + `app-error` | as above: the projected `<label>` lives in the page | the relay | native |
| `app-field`: label, input and error in one component | `<label for>` inside, same tree | `aria-describedby` inside | native |

A **control-component** is a component whose root template carries `formassociated`. Its author
writes the bridge, which is plain standard HTML, on the same template:

```html
<app-input>
  <template shadowrootmode="open" formassociated shadowrootreferencetarget="campo">
    <input id="campo" type=@type control=@ctrl>
  </template>
</app-input>
```

The page writes its label and marker as it would for a native control:

```html
<label for="ali">Alias</label>
<app-input id="ali" .type="text" control=@f.alias></app-input>
<app-error error=@f.alias></app-error>
```

- **The bridge.** `shadowrootreferencetarget="campo"` forwards whatever points at the host — the
  `<label for="ali">` — to the element with that id inside. The author decides which element it
  is (the input, or the `<fieldset>` around some radios); the compiler never chooses one. It has
  to be a static id of that template (`FUD0605`). The compiler carries it where it has to go —
  the template the server writes, `referenceTarget` in the client's `attachShadow` — and nothing
  more. Only Chrome has the bridge today. Without the attribute there is no bridge, and nothing
  for the relay below to work on.
- **The relay.** What is written *on* the host — the `aria-describedby` of an outside marker or
  of a summary entry, `aria-labelledby`, `aria-label` — the bridge does not forward, anywhere.
  `FudicControlElement` hands it to the field with element reflection
  (`ariaDescribedByElements`, `ariaLabelledByElements`), merged with what the field already has.
  **Where there is no bridge** (Safari, Firefox) it also associates the labels pointing at the
  host (`internals.labels`). The day the bridge is everywhere that half goes, and the HTML does
  not change.
- **An outside marker.** `error=` next to a control-component host pairs with it: the compiler
  writes `aria-describedby` on the host and the parent writes the text into the marker. A
  wrapper like `app-error` paints it with a `<slot>` and hides with `:host(:empty)`. Next to a
  component that is *not* `formassociated` it is still `FUD0597`: there is no field to relay to.

**Why `app-label` projects the `<label>` instead of drawing its own.** A `<label>` inside a
shadow root can only point inside that shadow root, and no standard, not even a proposal, has a
bridge going out. So the page writes the `<label>` and `app-label` shows it through a `<slot>`.
The alternative that works for the *name* is an `app-label` with its own text and an `id`,
referenced from the control's host with `aria-labelledby` (which the relay carries) — but
clicking that text does not focus the input, because there is no `<label>` associated. It loses
the click.

`formassociated` is a fudic marker, not a standard attribute; fudic intends to propose it. It
decides the base class (`FudicControlElement`), `delegatesFocus`, loading the component with the
page, and the fallback of the bridge: the bridge itself is the standard attribute, and the
component's author writes it. The day every browser has it, the fallback goes and no wrapper changes.

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
