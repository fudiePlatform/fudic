# view

What the markup of a `.fud`, and the part of `@code` the server evaluates, may contain: a closed list that lowers with the same meaning to TypeScript, C#, Java, Go, Rust and Python.

## The rule

The view fills holes; it does not program. Anything not listed here is an error, even if it is valid JavaScript. "It works in JS" is never the test: the test is whether the compiler can lower it to every backend language.

The list applies to:

- `@(expr)`, the implicit `@name`, `@a.b`, `@count()`, and `@raw(expr)`;
- every attribute value, `.prop=`, `class:`, `style:`, `ref`, `control`, `error=`;
- the headers of `@if`, `@switch`, `case`, `@foreach`, `@for`, `@while` and their `key ( … )`;
- the arguments of `@render`;
- `@{ … }`;
- what the view reads of `@code`, transitively (below).

It does **not** apply to event handlers (`@click=@(…)`, `bus:x=@f`) or to a callback prop (`.onPick=@chosen`): those are plain TypeScript that only runs in the browser. Put JS-only logic there, or compute values in a `computed`, in the page's `load()` (topic `pages`) or in a pipe.

## Values and names

- Literals: strings (`"active"`), numbers in any JS notation except `bigint` (`3.5`, `1e3`, `0x10`, `1_000`), `true`, `false`, `null`.
- `undefined` is the one global. `Math`, `JSON`, `Date`, `Intl`, `Number`, `String`, `Object`, `NaN`, `window`, `document`, `console` are `FUD0907`.
- Names: what the template declares, what `@code` declares, and `data` in a page.
- `null` and `undefined` mean the same: **absent**. `x === null` and `x === undefined` both ask "is it missing?".
- All arithmetic is 64-bit float, as in JS.

## Operators

| Operator | Operands |
|---|---|
| `+` | two numbers (sum), or a string with a string or a number (join) |
| `- * / %`, unary `-` | numbers; `%` keeps the sign of the dividend |
| `===`, `!==` | two primitives of the same type, or one side `null`/`undefined` |
| `<`, `<=`, `>`, `>=` | two numbers, two strings or two dates |
| `&&`, `\|\|`, `!` | booleans only |
| `a ?? b` | `a` may be absent |
| `c ? a : b` | `c` is a boolean |
| `a \| pipe` | a pipe (below) |

Not allowed (`FUD1142`): `==`, `!=`, `typeof`, `instanceof`, `in`, `void`, unary `+`, `~`, `&`, `^`, `<<`, `>>`, `>>>`, `**`. Assignment, `++`, `--`, `delete` are `FUD0900` (only `@{ }` reassigns). The comma operator is `FUD0906`. A regex literal is `FUD0919`.

**No truthiness.** Conditions, the operands of `&&`, `||`, `!`, and the arrow of `filter` are booleans (`FUD1151`). What counts as true for `""`, `0` or an empty list differs between languages.

- `@if (name)` → `@if (name !== "")` or `@if (name !== null)`.
- `title || "Untitled"` → `title ?? "Untitled"`.
- `count && "…"` → `count > 0 ? "…" : ""`.
- "Nothing to show" → `@empty` (below).

**Strings and dates compare with `<`.** Strings compare by UTF-16 code unit, as JS does (`"Z" < "a"` is `true`); there is no dictionary order by language. Dates compare by instant. Never subtract two dates: compare them.

## Calls: only reactive reads

The one call the view makes is reading a reactive value, with no arguments: a `signal`, a `computed`, a form or one of its controls (`count()`, `form.$valid()`, `field.errors()`, `field.pending()` while a remote rule has not answered: `@if (form.alias.pending()) { <small>Checking…</small> }`). Plus `t("…")` from `@fudic/i18n`, only as the value of a prop; the link of a server function, `photo.url({ id: p.id })` (an object of plain fields, or `url()` with no arguments), anywhere; and the five collection operations.

Everything else is `FUD1140`: a function of `@code` (`@format(x)`), an import, a method of any prototype (`find`, `some`, `includes`, `join`, `sort`, `slice`, `toFixed`, `toUpperCase`, `toLocaleString`), a call with `?.()`. `new` is `FUD1141`. An arrow anywhere except as the argument of a collection operation, and a tagged template, are `FUD0905`. `as`, `satisfies`, `x!` and type arguments are `FUD1144`. An object or array literal is `FUD1143`.

## Access and text

- `a.b`, `a?.b`: a field of a typed object (props, `data`, a `.fudapi` type, a form).
- `xs[i]`, `xs?.[i]`: `i` is a number; out of range is absent.
- `m[k]`: `m` is a map (`Record`); a missing key is absent. `post["title"]` on an object that is not a map is `FUD1153`.
- Templates without a tag: `` `/blog/${post.slug}` ``; each hole a string or a number.
- `@(x)` paints a string, a number, a boolean or nothing (absent). A date is painted only through a pipe.

## Control

- `@if (c) { … } else if (c) { … } else { … }`, `c` boolean.
- `@switch (x) { case "a": … case "b": … default: … }`: `x` is a string, a number or a union of literals; each `case` is a literal (`FUD1148`).
- `@foreach (const x of xs) key (x.id) { … }`: `xs` is a list; the key is a string or a number. Destructuring works in the header: `@foreach (const { id, title, author: { name: who }, featured = false } of posts) key (id)`.
- `@for (let i = 0; i < n; i++) key (i) { … }`: the step writes only the variables its header declares.
- `@while (c) key (k) { … }`: its body must write what `c` reads (`FUD0913`).
- Every loop needs its `key ( … )` (`FUD0540`).
- `@empty { … }` goes right after the closing brace of a loop and renders when the loop makes no turn (`FUD1149` elsewhere or twice). It does not see the loop variable.
- `@{ … }` holds `const`/`let` (object destructuring allowed) and reassignments of a variable (`x = e`, `x += e`, `x++`). No `if`, loops, calls or member writes (`FUD0908`, `FUD0900`). A name it declares is seen after it, in the same block.
- `@raw(html)` writes markup and must be the only content of its element (`FUD0990`). It only writes elements for a value marked with `trustedHtml(…)` in `@code`; any other string is written escaped.
- Destructuring and rest: object patterns only (`FUD1146` for `[a, b]` or `{ [k]: v }`). A `...rest` is read by field (`rest.title`), spread on a tag (`<input ...rest>`, `<app-card ...rest>`) or destructured again; anything else is `FUD1147`.

## Collections: five pieces

`filter`, `map`, `reduce` (always with its initial value), `toSorted` and `.length`. They never modify the list. Each takes one arrow with an expression body and plain parameters: `x` or `(x, i)` for `filter`/`map`, `(acc, x)` or `(acc, x, i)` for `reduce`, `(a, b)` for `toSorted`. A block body, a function name (`xs.filter(isValid)`), an extra parameter or argument, or a `reduce` without its initial value is `FUD1145`. `map` returns a value or a field, never an object literal (`FUD1143`). `.length` works on a list and on a string, not on a map (`FUD1153`).

| Need | Write |
|---|---|
| count all | `tasks().length` |
| count matching | `tasks().filter(t => t.priority === 1).length` |
| any? (`some`) | `tasks().filter(t => t.priority === 1).length > 0` |
| all? (`every`) | `tasks().filter(t => !t.done).length === 0` |
| contains? (`includes`) | `tags.filter(t => t === "urgent").length > 0` |
| first matching (`find`) | `tasks().filter(t => t.id === selected())[0]` (absent if none) |
| first three (`slice`) | `tasks().filter((t, i) => i < 3)` |
| one field | `tasks().map(t => t.title)` |
| sum | `lines.reduce((s, l) => s + l.price * l.quantity, 0)` |
| max / min | `notes.reduce((m, n) => n > m ? n : m, 0)` · `notes.reduce((m, n) => n < m ? n : m, 10)` |
| average | `notes.length > 0 ? notes.reduce((s, n) => s + n, 0) / notes.length : 0` |
| join text (`join`) | ``authors.reduce((s, a, i) => i === 0 ? a.name : `${s}, ${a.name}`, "")`` |
| sort by number | `tasks().toSorted((a, b) => a.priority - b.priority)`; reversed `b.price - a.price` |
| sort by text or date | `xs.toSorted((a, b) => a.title < b.title ? -1 : a.title > b.title ? 1 : 0)` |
| chain | `lines.filter(l => !l.paid).map(l => l.price * l.quantity).reduce((s, x) => s + x, 0)` |
| characters left | `@(140 - text().length)` |

A comparator must return `0` for equal items and opposite signs when `a` and `b` swap: `(a, b) => a.title < b.title ? -1 : 1` is wrong. `toSorted` is stable. Grouping, removing duplicates, flattening, reversing and concatenating build new lists: do them in `load()` or a handler.

## What the server evaluates of `@code`

`@code` is browser code, but the server evaluates every declaration the view reads, transitively. Each must have one of these forms (else `FUD1150`, on the declaration):

- `const { a, b = 1, ...rest } = props<T>()`;
- `const x = signal(v)` or `signal<T>(v)`, with `v` from this list, a data literal or `now()`;
- `const x = computed(() => e)`, with `e` from this list;
- `const x = e` or `let x = e`, with `e` from this list, a data literal or a catalogue call: `signal`, `computed`, `props`, `inject(Token)`, `trustedUrl`, `trustedHtml`, the pipe presets with literal options, `t()`, and a pipe of your own called with literal parameters;
- `import` from the project (a store of signals, a module whose `export default` is a data literal, a pipe), from `fudic:<id>` (a `.fudapi`), a catalogue name from a `@fudic/*` package, or a fudic library. Any other package is `FUD1150`.

A data literal is a list of primitives (`["a", "b"]`) or an object/array literal whose type is named: a `type` of a `.fudapi`, or the props of a component. `now()` is allowed only as the whole argument of `signal(…)` (`FUD0912`): the server evaluates it once per render, and the browser that hydrates reads the same instant. Move it on from a handler: `shown.set(new Date())`.

Functions, `effect` and everything the view does not read are not restricted.

## Portable types

What the view and those declarations read is typed with: `string`, `number`, `boolean`, `Date`; unions of string literals; `T | null`, `T | undefined`, `x?: T`; `readonly T[]` and `T[]`; `Readonly<Record<string, V>>` (a map); a `type` or `enum` of a `.fudapi`; the props of a component; `Signal<T>`, `Computed<T>`, a pipe, forms and their controls. A function type only for a callback prop. An anonymous nested object, a tuple, a class, `Map`, `Set`, `any` or `unknown` is `FUD1153`. Declare data types in the component's `.fudapi` (topic `fudapi`).

## A component that uses the list

```fudapi path=src/components/app-tasks/app-tasks.fudapi
# The tasks the list shows.
type Task
  id        i32
  title     str
  priority  i32
  done      bool
  created   date
```

```fud path=src/components/app-tasks/app-tasks.fud
<link rel="server" href="./app-tasks.fudapi">

@code {
  /** The tasks, by priority, with how many are done. Ticking one moves the counters. */
  import { computed, date, now, signal } from "@fudic/core";
  import type { Task } from "fudic:components/app-tasks/app-tasks";

  const { initial = [] } = props<{
    /** The tasks to start with. */
    initial?: readonly Task[];
  }>();

  const tasks = signal<readonly Task[]>(initial);
  const done = computed(() => tasks().filter(t => t.done).length);
  const pending = computed(() => tasks().filter(t => !t.done).length);
  const byPriority = computed(() => tasks().toSorted((a, b) => a.priority - b.priority));
  const shown = signal(now());
  const short = date({ dateStyle: "short", timeZone: "Europe/Madrid" });

  function toggle(t: Task) {
    tasks.set(tasks().map(x => x.id === t.id ? { ...x, done: !x.done } : x));
  }
}

<app-tasks>
  <template shadowrootmode="open">
    <p class="count">Done: @done() · Pending: @pending()</p>
    <ul @change=@toggle(t)>
      @foreach (const t of byPriority()) key (t.id) {
        <li>
          <label>
            <input type="checkbox" .checked=@t.done delegate:t="change">
            @t.title
            <small>@(t.created | short), @(t.created < shown() ? "past" : "upcoming")</small>
          </label>
        </li>
      } @empty {
        <li>No tasks.</li>
      }
    </ul>
    <button type="button" @click=@(() => tasks.set([]))>Clear</button>
    <p>Shown at @(shown() | short)</p>
  </template>
</app-tasks>
```

The server evaluates the two `computed` and paints the counts; in the browser, ticking a box runs the handler (free TypeScript: `{ ...x }` is fine there) and the counts repaint.

## Pipes: formatting

A pipe formats a value as text in the page's locale (an app without `"locales"` is `en`). The presets come from `@fudic/core`: `date` (requires `timeZone`), `number`, `currency`, `percent`, `relativeTime`, `list`. Fix their options in `@code` with literals; the view only writes `|`:

- `const euros = currency("EUR");` → `@(total() | euros)`
- `const twoDecimals = number({ minimumFractionDigits: 2, maximumFractionDigits: 2 });` → `@(price | twoDecimals)`
- `const long = date({ dateStyle: "long", timeZone: "Europe/Madrid" });` → `@(published | long)`

Without parentheses the pipe binds to the value: `@name|initials`.

A pipe of your own: `fudic_generate { kind: "pipe", name: "initials", on: "str" }` writes its contract, its one implementation and a test in `src/pipes`. The same file formats on the server and in the browser.

```fudapi path=src/pipes/initials.fudapi
# The initials of a name, upper case: "ada lovelace" → "AL".
pipe initials
  on str
```

```ts path=src/pipes/initials.ts
import { initials } from 'fudic:pipes/initials';

export default initials.implement((value, locale) =>
  value
    .split(/\s+/u)
    .filter((word) => word !== '')
    .map((word) => word.charAt(0).toLocaleUpperCase(locale))
    .join(''),
);
```

```fud path=src/components/app-author/app-author.fud
@code {
  /** The author of a post, with a round badge of their initials. */
  import initials from "../../pipes/initials";

  const { name } = props<{
    /** The author's full name. */
    name: string;
  }>();
}

<app-author>
  <template shadowrootmode="open">
    <p><abbr title=@name>@(name | initials)</abbr> @name</p>
  </template>
</app-author>
```

A pipe declared with parameters (`max u32` under `on str`) is implemented as `(value, { max }, locale) => …`, and the view uses it configured once in `@code`: `const short = truncate({ max: 40 });` → `@(summary | short)`.

## Instead of… (JS habits)

| Instead of… | Write | Code |
|---|---|---|
| `xs.find(x => x.id === id)` | `xs.filter(x => x.id === id)[0]` | `FUD1140` |
| `xs.some(x => x.ok)` | `xs.filter(x => x.ok).length > 0` | `FUD1140` |
| `xs.every(x => x.ok)` | `xs.filter(x => !x.ok).length === 0` | `FUD1140` |
| `xs.includes(v)` | `xs.filter(x => x === v).length > 0` | `FUD1140` |
| `names.join(", ")` | ``names.reduce((s, n, i) => i === 0 ? n : `${s}, ${n}`, "")`` | `FUD1140` |
| `xs.sort(cmp)` | `xs.toSorted(cmp)` | `FUD1140` |
| `xs.slice(0, 3)` | `xs.filter((x, i) => i < 3)` | `FUD1140` |
| `n.toFixed(2)`, `d.toLocaleDateString()` | a `number` or `date` pipe | `FUD1140` |
| `s.toUpperCase()`, `String(n)` | a pipe of your own; `@n` paints a number | `FUD1140` |
| `format(x)` (a function of `@code`) | `computed(() => …)` with the list, or a pipe | `FUD1140` |
| `new Date()` | `const shown = signal(now())` in `@code` | `FUD1141` |
| `Math.max(a, b)`, `JSON.stringify(x)`, `window.innerWidth` | `a > b ? a : b`; compute the rest in a handler or `load()` | `FUD0907` |
| `@if (name)`, `@if (items.length)` | `@if (name !== "")`, `@empty` | `FUD1151` |
| `title \|\| "Untitled"` | `title ?? "Untitled"` | `FUD1151` |
| `ok && "Saved"` | `ok ? "Saved" : ""` | `FUD1151` |
| `a == b`, `a != b` | `a === b`, `a !== b`; presence `x === null` | `FUD1142` |
| `typeof x === "string"` | a typed value from the `.fudapi` | `FUD1142` |
| `x ** 2` | `x * x` | `FUD1142` |
| `{ a: 1 }` or `[1, 2]` in the markup | a `const` in `@code` with a named type | `FUD1143` |
| `x as string`, `x!` | type it where it is declared | `FUD1144` |
| `xs.reduce((a, b) => a + b)` | `xs.reduce((a, b) => a + b, 0)` | `FUD1145` |
| `xs.filter(isValid)` | `xs.filter(x => x.valid)` | `FUD1145` |
| `const [first, second] = pair` | an object pattern | `FUD1146` |
| `i++`, `x = 1` in an expression | `@{ x = 1; }` | `FUD0900` |
| a tagged template, an arrow outside a collection operation | markup with `@x`; the arrow in a handler | `FUD0905` |
| `/\d+/.test(s)` | compute it in `load()` | `FUD0919`, `FUD1140` |

Ternaries and untagged template literals are allowed, as long as the condition is a boolean and each hole is a string or a number.

```fud broken=FUD1140 path=src/components/app-authors/app-authors.fud
@code {
  const { authors = [] } = props<{ authors?: readonly string[] }>();
}

<app-authors>
  <template shadowrootmode="open">
    <p>By @(authors.join(", "))</p>
  </template>
</app-authors>
```

Fixed: `<p>By @(authors.reduce((s, a, i) => i === 0 ? a : `${s}, ${a}`, ""))</p>`.

```fud broken=FUD1151 path=src/components/app-greeting/app-greeting.fud
@code {
  const { name = "" } = props<{ name?: string }>();
}

<app-greeting>
  <template shadowrootmode="open">
    @if (name) {
      <p>Hello, @name</p>
    }
  </template>
</app-greeting>
```

Fixed: `@if (name !== "") { … }`.

```fud broken=FUD1141 path=src/components/app-due/app-due.fud
@code {
  const { due } = props<{ due: Date }>();
}

<app-due>
  <template shadowrootmode="open">
    <p>@(new Date() > due ? "Late" : "On time")</p>
  </template>
</app-due>
```

Fixed: `import { now, signal } from "@fudic/core"; const today = signal(now());` in `@code`, then `@(today() > due ? "Late" : "On time")`.

After every write, `fudic_check`; a code you do not understand, `fudic_guide { topic: "FUD1140" }`.
