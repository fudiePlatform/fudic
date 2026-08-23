/**
 * BUG-23 — the eight symptoms, measured against the editor.
 *
 * Written RED first (task 1). Every `it` here asserts what the BUG says the editor must do,
 * so on the code that opened the bug all of them fail; the failures are the measurement, and
 * they are what the phases that follow are compared against. A symptom that is not yet fixed
 * is marked `it.fails` — the suite stays green at every commit and the flip to a plain `it`
 * is the proof that the phase landed. Nothing else in the file changes when that happens.
 *
 * The reproduction is the `.fud` of §1 of the BUG, adapted to this fixture workspace: a
 * private copy, because it creates a component of its own and the other acceptance files
 * assert over a workspace of exactly four documents while running in parallel.
 *
 * `signal` is declared inside `@client` rather than imported from `@fudic/core`: what makes a
 * name reactive is the CALLEE (`signal(...)` / `computed(...)`), never where it came from, and
 * the fixture project has no node_modules to resolve a package from.
 */

import { writeFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CompletionRequest,
  DocumentDiagnosticRequest,
  type CompletionItem,
  type CompletionList,
  type Diagnostic,
  type FullDocumentDiagnosticReport,
} from 'vscode-languageserver-protocol/node';
import { copyWorkspace, startHarness, type Harness } from './_harness.js';

/** A component with a REQUIRED prop and a named slot — the two things `app-badge` has not. */
const CIRCLE = `@code {
  type Tone = 'neutral' | 'info';

  const { name, tone = 'neutral' } = props<{ name: string; tone?: Tone }>();
}

<app-circle>
  <template shadowrootmode="open">
    <span>@name</span>
    <slot name="PEPITO"></slot>
  </template>
</app-circle>
`;

/** Everything above the markup of the reproduction: the links, the `@code` and the section. */
const HEAD = `<link rel="layout" href="../layouts/_layout.fud">
<link rel="component" href="../components/app-circle.fud">

@code {
  type PageData = { title: string };

  @server {
    export async function load(): Promise<PageData> {
      return { title: 'Untitled' };
    }
  }
  @client {
    type Signal<T> = { (): T; set(next: T): void };
    declare function signal<T>(initial: T): Signal<T>;
    type Tone = 'neutral' | 'info';

    const items = [{ id: 1 }];
    const counter = signal({ id: 1 });
    const titulo = signal<Tone>('info');
    function onClick(ev: MouseEvent): void { void ev; }
  }
}

@section nav {
  <span>nav</span>
}

`;

const PAGE = 'blog/bug23.fud';

/** The reproduction with `markup` as its body. */
const page = (markup: string): string => `${HEAD}${markup}\n`;

let harness: Harness;
let version = 1;

beforeAll(async () => {
  const root = copyWorkspace();
  writeFileSync(`${root}/components/app-circle.fud`, CIRCLE);
  writeFileSync(`${root}/${PAGE}`, page('<h1>Home</h1>'));

  harness = await startHarness({ root });
  await harness.open('components/app-circle.fud');
  await harness.open(PAGE);
}, 60_000);

afterAll(async () => {
  await harness.stop();
});

/** Rewrite the reproduction with `markup` and pull its diagnostics, errors and warnings only. */
async function problemsFor(markup: string): Promise<Diagnostic[]> {
  const { uri } = await harness.open(PAGE);
  await harness.change(uri, page(markup), ++version);
  const report = (await harness.client.sendRequest(DocumentDiagnosticRequest.type, {
    textDocument: { uri },
  })) as FullDocumentDiagnosticReport;
  return report.items.filter((item) => (item.severity ?? 1) <= 2);
}

/**
 * Rewrite the reproduction with `markup` — whose `|` is the cursor — and ask for completion
 * there, the way an editor asks: with the character that was just typed.
 *
 * The trigger matters and is not a decoration. Volar skips every plugin that does not declare
 * the character, so a request without it measures a client nobody ships (BUG-16 §6.13).
 */
async function completeAt(markup: string, triggerCharacter: string): Promise<CompletionItem[]> {
  const text = page(markup.replace('|', ''));
  // `HEAD.length`, not `page('').length`: `page` appends a trailing newline, so measuring the
  // prefix through it puts every cursor of this file ONE character to the right. That is not a
  // detail — at `<app-circle .|>` it lands the request on the `>`, where the position maps to
  // no stretch of the projection at all, TypeScript is never asked, and the HTML service
  // answers instead. Every reading of symptom 1 taken with this harness measured that.
  const at = HEAD.length + markup.indexOf('|');
  const { uri } = await harness.open(PAGE);
  await harness.change(uri, text, ++version);

  const answer = (await harness.client.sendRequest(CompletionRequest.type, {
    textDocument: { uri },
    position: harness.positionAt(text, at),
    context: { triggerKind: 2, triggerCharacter },
  })) as CompletionList | CompletionItem[] | null;

  if (answer === null) return [];
  return Array.isArray(answer) ? answer : answer.items;
}

/** Labels without TypeScript's `?`, which is how it marks an optional property. */
const names = (items: CompletionItem[]): string[] =>
  items.map((item) => item.label.replace(/\?$/u, ''));

/** The source line a diagnostic starts on, so a range can be read without counting offsets. */
const lineOf = (markup: string, at: Diagnostic): string =>
  page(markup).split('\n')[at.range.start.line] ?? '';

// Green since the root stopped filling the silence. Two things had to be true at once: the
// `.` anchor stands inside `$props<$C0>` (task 8), and no service of the ROOT may answer at a
// position the projection owns — Volar walks the root LAST and an empty list does not claim a
// position, so the HTML service was answering here whenever TypeScript had nothing to say.
describe('§2.1 / symptom 1 — the dot offers the vocabulary of HTML', () => {
  it('offers only the props of the component', async () => {
    const items = await completeAt('<app-circle .|></app-circle>', '.');

    expect(names(items)).toContain('name');
    expect(names(items)).not.toContain('id');
    expect(names(items)).not.toContain('class');
    expect(names(items)).not.toContain('role');
  });
});

describe('§2.2 / symptom 2 — a dangling dot is text, not part of the `@`', () => {
  // The dangling dot is copied since task 10, so `$text(data.)` is a position TypeScript can
  // answer. What was missing was `memberContextAt`: outside a tag the server did not recognise
  // the dot, fell through to `return emmet`, and a non-empty reply from the root claims the
  // position — so Emmet was answering where the members of `PageData` belong.
  it('offers the members of the route data after `@data.`', async () => {
    const items = await completeAt('<div>@data.|</div>', '.');

    expect(names(items)).toContain('title');
  });

  it('and the dangling dot adds no diagnostic of its own', async () => {
    expect(await problemsFor('<div>@data.</div>')).toEqual([]);
  });
});

describe('§2.3 / symptom 3 — an unquoted value can be one `@` expression (tasks 2 and 4)', () => {
  it('takes `.prop=@expr` without FUD0056', async () => {
    const problems = await problemsFor('<app-circle .name=@data.title></app-circle>');

    expect(problems).toEqual([]);
  });

  it('and a chain with a call needs no parentheses', async () => {
    const problems = await problemsFor('<div id=@counter().id></div>');

    expect(problems).toEqual([]);
  });
});

describe('§2.4 / symptom 4 — the projection does not know a call is a deferred invocation', () => {
  it('reports nothing on a handler written as a call', async () => {
    const problems = await problemsFor('<div @mousedown="@onClick($event)">x</div>');

    expect(problems).toEqual([]);
  });

  it('and shows FUD0291 on a value that can never be a listener', async () => {
    const problems = await problemsFor('<div @click="@(1)">x</div>');

    expect(problems.map((item) => item.code)).toContain('FUD0291');
  });
});

describe('§2.5 / symptom 5 — the `@` in text is answered by the server, and answering silences the rest', () => {
  // BOTH, which is the whole of this criterion. Volar gives the position to the first document
  // that answers and walks the root LAST, so the server's snippets and TypeScript's names could
  // never appear together — whichever spoke silenced the other. The snippets now ride with
  // TypeScript's reply, and `emitDanglingAt` gives the bare `@` a hole to be asked from.
  it('offers the directives AND what is in scope', async () => {
    const items = await completeAt('<div>@|</div>', '@');

    expect(names(items)).toContain('@foreach');
    expect(names(items)).toContain('data');
    expect(names(items)).toContain('items');
    expect(names(items)).toContain('counter');
  });

  it('and keeps offering both once a letter is typed', async () => {
    const items = await completeAt('<div>@c|</div>', '@');

    expect(names(items)).toContain('@foreach');
    expect(names(items)).toContain('counter');
  });

  it('and none of the TypeScript scope that the template cannot see', async () => {
    const items = await completeAt('<div>@|</div>', '@');

    expect(names(items)).not.toContain('atob');
    expect(names(items)).not.toContain('AbortController');
  });
});

/**
 * The value of a binding is an expression over what the TEMPLATE sees, and nothing else.
 *
 * Measured at the exact shape of the user's screenshot: `<app-circle .name=@a|>`, where the
 * list was `arguments`, `addEventListener`, `alert`, `as`, `async`, `atob`, `await`, plus
 * auto-imports from `@fudic/vite` and `@fudic/transport`. Every one of those is a name the
 * runtime does not have at that position.
 */
describe('§2.3 — what may go after a `=@`', () => {
  // `@a`, and not a bare `@`, because that is the screenshot: the user had typed one letter.
  // A bare `@` with nothing behind it is not a RazorExpression at all — the tokenizer degrades
  // it to a plain attribute — so it has no hole in the projection to ask from. That half is
  // measured below, and is the same defect `@click=@` had.
  it('offers the route data, the props and the names of `@client`', async () => {
    const items = await completeAt('<app-circle .name=@a|></app-circle>', '@');

    expect(names(items)).toContain('data');
    expect(names(items)).toContain('counter');
    expect(names(items)).toContain('titulo');
    expect(names(items)).toContain('onClick');
  });

  it('and none of the TypeScript scope that is not in it', async () => {
    const items = await completeAt('<app-circle .name=@a|></app-circle>', '@');

    expect(names(items)).not.toContain('atob');
    expect(names(items)).not.toContain('arguments');
    expect(names(items)).not.toContain('alert');
    expect(names(items)).not.toContain('AbortController');
  });

  it('offers `@()` as the escape hatch to any expression', async () => {
    const items = await completeAt('<app-circle .name=@a|></app-circle>', '@');

    expect(names(items)).toContain('@()');
  });

  // The bare `@`, which is what the user actually presses first. A `=@` with nothing behind it
  // is not a RazorExpression — the tokenizer scans one only where an identifier begins — so it
  // degrades to a plain attribute whose text is `"@"`. `emitTextValue` projects it as the empty
  // expression it really is, which is what puts a hole here to ask from.
  it('offers the same list on a bare `@`, before any letter is typed', async () => {
    const items = await completeAt('<app-circle .name=@|></app-circle>', '@');

    expect(names(items)).toContain('data');
    expect(names(items)).toContain('onClick');
  });

  // The same scope as a prop, minus what cannot be called: after `@click=` a listener is the
  // only thing that fits, so `counter` — a `const` holding a signal — drops out while `onClick`
  // stays. It is one rule with one narrowing, not a list of its own.
  it('offers only what can be called after an event, out of the same scope', async () => {
    const items = await completeAt('<app-circle .name="x" @click=@|></app-circle>', '@');

    expect(names(items)).toContain('onClick');
    expect(names(items)).toContain('@()');
    expect(names(items)).not.toContain('counter');
    expect(names(items)).not.toContain('data');
    expect(names(items)).not.toContain('atob');
  });

  it('offers them once a letter is typed too', async () => {
    const items = await completeAt('<app-circle .name="x" @click=@o|></app-circle>', '@');

    expect(names(items)).toContain('onClick');
    expect(names(items)).not.toContain('atob');
  });

  it('and inside quotes, which is how the docs write it', async () => {
    const items = await completeAt('<app-circle .name="x" @click="@o|"></app-circle>', '@');

    expect(names(items)).toContain('onClick');
  });
});

describe('§2.6 / symptom 6 — the slot is checked against the wrong tag', () => {
  it('reports a slot the parent does not declare', async () => {
    const markup = '<app-circle .name="x">\n  <div slot="p"></div>\n</app-circle>';
    const problems = await problemsFor(markup);

    expect(problems.length).toBeGreaterThan(0);
    expect(lineOf(markup, problems[0]!)).toContain('slot="p"');
  });

  it('reports a slot written with no component parent at all', async () => {
    const problems = await problemsFor('<div slot="PEPITO"></div>');

    expect(problems.length).toBeGreaterThan(0);
  });

  it('offers the slots of the parent inside the value', async () => {
    const items = await completeAt(
      '<app-circle .name="x">\n  <div slot="|"></div>\n</app-circle>',
      '"',
    );

    expect(names(items)).toContain('PEPITO');
  });
});

describe('§2.1 / symptom 7 — a required prop nobody passes', () => {
  it('reports over the tag name, with the name of the prop in the message', async () => {
    const markup = '<app-circle></app-circle>';
    const problems = await problemsFor(markup);

    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0]!.message).toContain('name');
    expect(lineOf(markup, problems[0]!)).toContain('<app-circle>');
  });

  // Green already, and it stays green: the guard that the error of the criterion above is
  // about the prop being ABSENT and not about the host being a component.
  it('and says nothing once the prop is passed', async () => {
    expect(await problemsFor('<app-circle .name="x"></app-circle>')).toEqual([]);
  });
});

/**
 * The `.prop` half of symptom 8 is measured in `language-core`, not here, and the reason is
 * worth writing down: when the value is a CALLABLE whose call would fit, TypeScript anchors
 * the error on the expression instead of on the key — and the expression is wrapped in the
 * `(` `)` this projection adds, so both ends of the reported range land in scaffolding and
 * Volar drops it. The wrong judgement is made either way; here it is merely invisible.
 *
 * What IS visible here is the same rule on a plain attribute, where the projection is
 * `$attr(titulo)` and the error lands on the name the user wrote.
 */
describe('§2.8 / symptom 8 — the editor judges the object, the build crosses the value', () => {
  it('says nothing about a signal on a plain interpolated attribute', async () => {
    const problems = await problemsFor('<div id="@titulo"></div>');

    expect(problems).toEqual([]);
  });
});

describe('§2.8 — what must keep reporting', () => {
  it('a signal of the wrong type is still an error, over what the user wrote', async () => {
    const markup = '<app-circle .name="x" .tone="@counter"></app-circle>';
    const problems = await problemsFor(markup);

    expect(problems.length).toBeGreaterThan(0);
    expect(lineOf(markup, problems[0]!)).toContain('@counter');
  });
});
