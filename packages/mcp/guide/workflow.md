# workflow

How to work on a fudic project: the phases every piece goes through, who approves what, and the
write, check and fix loop.

## One step at a time

- **The first call of any fudic task is `fudic_status`.** It reads the files, the history of each
  piece and the project's diagnostics, and its `next` says one thing to do. Do that, then call
  `fudic_status` again.
- **No project yet** (`phase: "none"`): ask the user only what is missing for `fudic_new` (what
  the app or library is for, its pages or components, its name and tag prefix), then call
  `fudic_new`.
- **Never move on with errors.** While the project has an error, the next step is to fix it.
- **Before writing a kind of file for the first time**, call `fudic_guide` for its topic. `next`
  reminds you when you have not read it in this session.

## The phases of a piece

A piece is a component or a route. Each one goes through these phases, in order. A phase is done
when its condition holds; `fudic_status` reports the phase of every piece in `units`.

| # | Phase | Done when | Who |
|---|---|---|---|
| 1 | `criteria` | The `.fudspec` and its fixture exist, and the user's approval is recorded and still valid | The user approves props and criteria together |
| 2 | `api` | Only with a server: the `.fudapi` exists and the `.fud` links it with `<link rel="server">` | You |
| 3 | `red` | Unit tests exist, and the last run of the tests and of the criteria is red **for the right reason** | You |
| 4 | `view` | Tests and criteria pass, on the current files | You |
| 5 | `connect` | Only with a server: every function of the `.fudapi` has a handler | You |
| 6 | `document` | JSDoc on the component and on each prop | You |
| 7 | `showcase` | Only in a library with a showcase: its page is up to date | You |
| 8 | `look` | Only in a component: the user approved how each case of its fixture looks, over the files as they are now | The user, after seeing `fudic_look` |
| — | `done` | `fudic_record { event: "done" }` wrote it in the history | You, when `next` says so |

A library has no `api` and no `connect` phase. A run whose files changed since is `stale` and
counts as not run.

### 1. Criteria: ask, propose, wait

1. Create the piece: `fudic_generate { kind: "component", name: "button", purpose: "<what the
   user asked for, in one sentence>" }`. `purpose` is required for a component and a page.
2. **Ask, do not build.** Ask the user for the props (name, type, default, meaning) and the
   behaviour. Propose them yourself when the user is vague, as a short list.
3. Write the proposal into the `.fudspec` (one criterion per sentence the user would say) and
   its fixture (one named set of props per case). Show it to the user.
4. **Wait for the user's approval in the conversation.** Only then call
   `fudic_record { piece: "src/components/app-button/app-button.fud", event: "approved" }`.

**Never approve on the user's behalf.** No approval because the criteria look obvious, because
the user is in a hurry, or because they asked for many components at once. A user who asks for
"a Button, a Card and an Input" gets questions about the Button first.

The approval holds the hash of the `.fudspec` and its fixture. Change either one and it
**expires**: `next` asks you to show the user what changed since the approval and ask again.

What goes in the `.fudspec` and what goes in the unit tests:

| `.fudspec` (browser, approved by the user) | Unit tests (written by you, no approval) |
|---|---|
| What a person would check by looking and touching | What the user would not see or approve |
| One sentence of the user is one criterion | Each prop variant; edge values: empty, long, 0 |
| Keyboard, focus, accessibility, visibility, layout | The `detail` of each event |
| | Server functions and their failures; each rule of a form |

What is already a criterion is not repeated as a unit test.

### 2. The server contract

Only for a piece with a server. `fudic_generate { kind: "api", name: "src/components/app-cart" }`
writes the `.fudapi` beside the `.fud`, its handler in `src/server` and the
`<link rel="server">`. A component starts with a `hello` function, a route with its `load`.
Write the real contract next. Read `fudapi` first.

### 3. Red for the right reason

Write the unit tests (read `testing` first), then run `fudic_test` and `fudic_spec_run`. Both
must fail, and each failure must be a `fail`: the assertion ran and the component did not do
it yet. A `broken` result (the test cannot run: a type error, a missing file, a page that does
not load) is not red, it is a bug in what you wrote. Fix it until every result is `fail`.

### 4. The view, until green

Write the `.fud` until `fudic_test` and `fudic_spec_run` pass. **Do not change the tests or the
criteria** in this phase: they are the judge. `fudic_test` takes milliseconds, use it as the
short loop; `fudic_spec_run` takes seconds, run it to confirm. `failing: true` repeats only
what was red.

If a test turns out to be wrong, say so to the user instead of editing it. A criterion that has
to change is a new approval.

### 5. Connect each function

Only with a server. `fudic_contract { id }` lists every declaration of the `.fudapi` that needs a
handler, with its TypeScript signature, its file in `src/server` and a skeleton that compiles.
`fudic_symbols { kind: "functions" }` marks each one `connected` or `missing`. A handler
translates to the backend; it holds no business logic.

### 6. Document

JSDoc is the documentation, and it is what `fudic_describe` serves to whoever uses the piece:

- the first `/** … */` of the `@code` documents the component: what it is for, and when to use
  another one instead;
- a `/** … */` above each prop of `props<…>()` documents that prop.

```fud path=src/components/app-badge/app-badge.fud
@code {
  /**
   * A short label beside a title: a state, a count, a category. Its text is the default slot.
   * For an action, use a button instead.
   */
  type Tone = 'neutral' | 'success' | 'warning';

  const { tone = 'neutral' } = props<{
    /** What the badge says about its subject. `neutral` unless it marks a success or a risk. */
    tone?: Tone;
  }>();
}

<head>
  <style>
    :host { display: inline-block; }
    .badge {
      font-size: 0.75rem;
      padding: 0.15rem 0.5rem;
      border: 1px solid #ccc;
      border-radius: 999px;
      background: #f3f3f3;
      color: #444;
    }
    .badge.success { background: #e6f4ea; border-color: #34a853; color: #1e7e34; }
    .badge.warning { background: #fef7e0; border-color: #f9ab00; color: #b06000; }
  </style>
</head>

<app-badge>
  <template shadowrootmode="open">
    <span
      class="badge"
      class:success=@(tone === 'success')
      class:warning=@(tone === 'warning')>
      <slot></slot>
    </span>
  </template>
</app-badge>
```

### 7. Showcase

Only in a library that has a showcase: `fudic_generate { kind: "showcase", name: "ui" }` writes a
page per component that has a fixture, with a block per case. Run it again after changing a
fixture; the phase is done when running it would change nothing.

### 8. Look

Only in a component. `fudic_look { piece }` paints every case of its fixture in a browser and
answers each one beside the shot of the look the user last approved: `new`, `same`, `changed` or
`gone`. Show the user the before and after and ask whether they approve how it looks. Only if they
say so, `fudic_record { piece, event: "look" }`; without a `fudic_look` over the files as they are
now it answers `FUD1427` and writes nothing.

**Seeing is not approving.** `fudic_render`, `fudic_preview` and `fudic_look` show; only
`fudic_record` writes. The look holds the hash of the files that can change how the component is
drawn — its view, what it links and imports, the global sheets — not its tests or its criteria. Change
any of them and the look **expires**: a piece that was `done` opens again, and `next` takes you through
its tests, its criteria and `fudic_look` once more. Approved again, it is complete; its `done` stays.

### Done

When `next` says so, `fudic_record { piece, event: "done" }`. If a phase is still missing it
answers `FUD1407` and says which one.

Other events of `fudic_record`, each only when the user says so in the conversation:

| `event` | When |
|---|---|
| `accepted` | The user says the client accepted the piece; `text` is what they said |
| `reopened` | The user asks to change the contract of a piece that is `done`; `text` says why |
| `look` | The user approved how the component looks, after `fudic_look` showed it to them |

## Write, check, fix

Every write is followed by a check, and nothing moves on until there are zero diagnostics:

1. **Write.** Through `fudic_write` in a chat, or your own editor tools. `fudic_write` already
   returns the diagnostics of what it touched.
2. **`fudic_check`.** What the build would say, over the whole project: one change in a
   component can break whoever uses it. `paths` only narrows the list.
3. **`fudic_fix`.** Applies every repair that has exactly one option, checks again and repeats.
   What has several options comes back in `remaining` with their titles: pick one.
4. **By hand.** For each diagnostic left, `codes` in the answer carries the why and the fix of
   each code; `fudic_guide { topic: "FUD0540" }` explains any code on its own. Fix it, then
   check again.

`fudic_format` formats `.fud` and `.fudspec` files. A `TS2322` or any other `TS` code is
TypeScript's own message, at its position in the `.fud`.

## Rules

- **Create files with `fudic_generate`, never from scratch.** It writes exactly what the CLI
  writes: the folder, the tag from the prefix, the test, the `.fudspec`, the fixture, the links.
  Then edit what it created.
- **Before using a component, call `fudic_describe` with its tag. Never open its file.** The
  answer has its link, props with types and defaults, slots, events with their `detail`, CSS
  parts, the tokens it reads, and an example of use. `fudic_symbols { kind: "components" }`
  lists what exists.
- **Before writing styles, call `fudic_symbols { kind: "tokens" }`** and use only those names.
  See `html-css`.
- **Before calling a server function or a route, describe it**: `fudic_describe` takes a route
  (`/blog/:slug`), a type, a function or a token as well as a tag.
- **Agree the design tokens with the user before the first component**: every component reads
  them.
- **Never write a `.fudlog` by hand.** The tools write it: `fudic_record` the decisions,
  `fudic_test` and `fudic_spec_run` their runs.
