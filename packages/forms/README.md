# @fudic/forms

The form model of fudic: controls, groups and validation. **No DOM in any branch** —
the same form runs in the browser, in the prerender and on the server.

A form is declared in a `.fudapi` (SDD-60), never built in code:

```
# src/forms/post.fudapi
form post
  title  str = ""
    required          "Write a title."
    min-length 3      "At least {n} characters."
  published  bool
  seo  group
    description  str = ""
    canonical    str = ""
```

fudic generates the form from it, the same declaration on both ends. A `.fud` that links the
file with `<link rel="server">` sees `post` by name; TypeScript imports it from
`fudic:forms/post`:

```ts
import { post } from 'fudic:forms/post';

post.title.set('Hello');
post.title();             // 'Hello'  — read by calling, like a signal
post.seo.description();   // ''       — a group is a nested form

await post.$validate();   // true
post.$value();            // { title: 'Hello', published: false, seo: { … } }
```

## What is public

`@fudic/forms` keeps the types (`Form`, `Control`, `GroupNode`, `Issue`…), the `$…` API of a
form, the texts and summaries the server paints, and what the compiler links (`./dom`, `./wire`,
`./element`). The builders — `form`, `group`, `control`, the typed factories (`str`, `u8`,
`arr`…), the validators (`required`, `min`, `max`, `minLength`, `maxLength`, `pattern`,
`validator`, `serverValidator`, `asyncValidator`), `setMessages`, `ValidateOn` and `Validity` —
moved to `@fudic/forms/contract`, an internal entry that only generated code imports. Their
place is the `.fudapi`:

| Before | Now, in a `.fudapi` |
|---|---|
| `control('', [required, minLength(3)])` | `title  str = ""` with `required` and `min-length 3` below it |
| `u8(0)`, `str('')`, `arr(str, [])` | the field's type: `u8`, `str`, `str[]` |
| `group({ … }, [rule])` | `name  group`, its fields below, its rules in its `summary` |
| `form(schema, { summary })` | the form's `summary`, with `require` rules |
| `validator`, `serverValidator`, `asyncValidator` | a `rule` with `runs both` or `runs server`, and `async` |
| `setMessages({ … })` | one `messages` block in the project |
| `ValidateOn.Blur \| ValidateOn.Input`, `Validity.Rules` | `validate-on blur input`, `validity rules` |

The built-in rules (`required`, `min`, `max`, `min-length`, `max-length`, `pattern`) and the
`email` pattern are declared in this package's `fudapi/` and need no import: installing
`@fudic/forms` makes them visible to every `.fudapi` of the app.

## Reading

Everything is read by calling it: the value, `errors`, `touched` and `dirty`. Reads are
tracked, so an `effect` that reads a control re-runs when it moves.

```ts
import { effect } from '@fudic/core';

effect(() => console.log(post.title(), post.title.errors()));
```

## Writing

Two operations, deliberately named apart:

```ts
post.$set({ title: 'A', published: true, seo: { … } });  // total: a missing field throws
post.$patch({ title: 'A' });                             // partial: nothing else is touched
```

`$set` refuses an incomplete object instead of emptying the fields you left out — which
is what a `PATCH` body carrying three fields of twelve would otherwise do.

## Validating

A field's validators run in declaration order and stop at the first failure, so a field has
*one* error, not a list. They may be async.

The **summary** is different: the errors that belong to no single field. A form's `summary`
rule and a group's rules (its second argument) **all** run, and a summary says every failure
at once — `$summary()` is the union of their errors, the first rule winning a repeated key.

```
form post
  …
  summary
    require seo       not published or not empty seo.description   "Describe it to publish it."
    require same-url  title != seo.canonical                       "The title is not a URL."
```

```ts
await post.$validate();                  // the rules that run in the browser
await post.$validate({ server: true });  // plus the `runs server` ones
```

A `require` is generated as the same rule on both ends; its code is the error, and `on field`
paints it on that field instead. A group has its own `summary`, and the same `validate-on` and
`validity` a form has, inherited by its fields exactly as from a nested form:

```
  acceso  group
    clave    str = ""
      required   "Pick a password."
    repetir  str = ""
      required   "Repeat it."
    summary
      require mismatch  clave == repetir   "The passwords do not match."
```

Errors that arrive from outside — a 422 — go in by path:

```ts
post.$setErrors({ 'seo.canonical': { protocol: true } });
```

An overtaken async validation never publishes: each control carries an epoch, so a slow
rule cannot paint the error of a value the user already changed.

A single control validates on its own, against the root of the form it belongs to:

```ts
await post.title.validate();   // false — and only post.title's error changes
```

When a bound field validates itself is `validate-on`, moments you combine. The submit always
validates; the moments add the ones before it:

```
form signup
  validate-on blur
  alias  str = ""
    required
    min-length 3
  email  str = ""
    validate-on blur input
    required
```

`blur` validates on leaving the field. `input` validates on every edit once the field has been
left once — never while it is typed for the first time. `submit` waits for the submit. A
field's own option wins over the nearest form's; with none, `blur input`.

## Validity

**Errors** are what the user is *shown*, governed by `touched` and `validateOn`. **Validity**
is whether the current values satisfy the rules, and it is silent: reading it never publishes
an error, never touches a field and never changes a marker.

```ts
signup.alias.valid();   // a control
signup.$valid();        // a form or a group: every child valid, and its own rules satisfied
```

Both are tracked (`computed`), so `disabled=@(!signup.$valid())` follows the values by itself —
including the field a cross-field rule reads. A 422 set with `$setErrors` keeps a control
invalid until its value changes.

What counts is a policy, set like `validate-on` (field → nearest form or group →
`interacted`):

```
form signup
  validity rules
```

- `validity interacted` (the default): a control counts once the user has left it or changed
  it. A fresh form is valid, and a disabled submit is enabled on arrival.
- `validity rules`: every rule counts from the start. A fresh form with an empty `required` is
  invalid, and the button is born disabled.

`valid()` never *calls* an asynchronous rule — reading it in a view would put a request on the
wire at every keystroke. Declare such a rule `async`, and the validity reads its verdict for
the current value instead, or counts it as pending:

```
rule taken
  on field str
  runs both
  async
  fails taken
```

```ts
// src/browser/taken.ts
import { taken } from 'fudic:rules/taken';
taken.check(async (value) => !(await isTaken(value)));
```

`runs server` rules do not run in the client at all: their implementation lives in
`src/server`, and their verdict arrives with the 422.

Two consequences to know before disabling a submit with `$valid()`:

- **A disabled button means no submit**, so nothing touches the fields or moves the focus.
  With the defaults (`blur`, `interacted`) this is harmless: a field only counts once left, and
  leaving it already paints its message. With `validity rules`, say *why* the button is
  disabled somewhere the user can read it.
- **`validate-on submit` + an `async` rule + a button disabled by `$valid()`** is a deadlock:
  the rule only runs on the submit, the submit never happens, and the control stays pending
  forever.

## Messages

A rule fails with a code and its arguments — `min-length` with `{ n: 3 }` — never a sentence.
The sentence comes from the field first, then from the project's `messages`, then falls back to
the rule code. A text is a template of what the rule gives:

```
messages
  required  "Required."

form signup
  alias  str = ""
    required
    min-length 3   "At least {n} characters."
```

```ts
signup.alias.message();   // '' until validated, then the text of its current error
signup.$messages();       // every text of the form's summary, in rule and key order, or []
signup.$message();        // the first of them, or ''
```

A summary's texts use the same chain: the text written beside the rule, then `messages`, then
the code.

What a summary with `fields` paints is `$issues()`: the node's own texts (path `''`) and,
after a submit attempt, the visible error of every field below it, in declaration order, a
group's own texts ahead of its fields. `$submitted()` says whether there was an attempt; the
DOM binding sets it on each submit, and `$reset` and `$set` clear it.

```ts
signup.$issues();   // [{ path: '', message: '…' }, { path: 'alias', message: 'Pick an alias.' }]
```

## In a template

Three reserved attributes:

| Attribute | Names | Paints |
|---|---|---|
| `control=@node` | any node | binds the element to it |
| `error=@control` | a **control** | its message once touched, as text |
| `summary=@form` | a **form or a group** | a list: `$messages()`, or `$issues()` with `fields` |

```html
<form control=@signup>
  <div class="summary" summary=@signup fields></div>
  <label for="ali">Alias <span aria-hidden="true">*</span></label>
  <input id="ali" control=@signup.alias>
  <small class="error" error=@signup.alias></small>
  <fieldset control=@signup.acceso>
    <div class="summary" summary=@signup.acceso></div>   <!-- "The passwords do not match." -->
    …
  </fieldset>
  <button type="submit" disabled=@(!signup.$valid())>Save</button>
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
<app-input id="ali" .type="text" control=@signup.alias></app-input>
<app-error error=@signup.alias></app-error>
```

- **The bridge.** `shadowrootreferencetarget="campo"` forwards whatever points at the host — the
  `<label for="ali">` — to the element with that id inside. The author decides which element it
  is (the input, or the `<fieldset>` around some radios); the compiler never chooses one. It has
  to be a static id of that template (`FUD0605`). The compiler carries it where it has to go —
  the template the server writes, `referenceTarget` in the client's `attachShadow` — and nothing
  more. Only Chrome has the bridge today. Without the attribute there is no bridge, and nothing
  for the relay below to work on. The attribute is honoured on ANY component, not only a
  control-component: it is the parser's, so it works with server-rendered HTML and no JavaScript,
  and `formassociated` only adds the fallback on top.
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

## One declaration, a copy per request

Both ends build the form from the same declaration. The browser keeps one; the server
validates a fresh copy for every request that sends it, so two requests never share state.

## Typed fields

A field's type is a range, so it validates — `u8` refuses 300, `uuid` a malformed id — and it
fixes the wire: a form whose fields all have a type travels positionally and in binary.

```
form line
  qty     u32 = 1
  vatPct  u8 = 21
  note    str = ""
  tags    str[]
```

## Scripts

```sh
pnpm --filter @fudic/forms test
pnpm --filter @fudic/forms typecheck
pnpm --filter @fudic/forms coverage
```
