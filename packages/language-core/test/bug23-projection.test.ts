/**
 * BUG-23 phase 3 — what the projection says now, over the emitted text.
 *
 * These go through the real orchestrator (`emitVirtualFiles`) rather than through
 * `emitClient`, and that is the point: three of the four things this phase adds are answers
 * the projection can only give when it has the file's JS — which reactives it declares, and
 * whether the root of a handler is a call. `emitClient` alone hands it neither, and then the
 * honest behaviour is the one BUG-23 found: copy the value as written.
 */

import { describe, expect, it } from 'vitest';
import { emitVirtualFiles } from '../src/emit.js';
import { parseFud, registryOf } from './_support.js';
import type { FileRegistry } from '../src/types.js';

const BADGE = registryOf({ 'app-badge': './app-badge.fud' });

/** The client virtual of a `.fud`, with the whole batch the orchestrator runs. */
function project(source: string, registry: FileRegistry = BADGE): string {
  const [client] = emitVirtualFiles({
    source,
    fileName: 'x.fud',
    document: parseFud(source),
    registry,
  });
  return client!.text;
}

/** A component file wrapping `markup` in the mandatory host + template (decision 75). */
const component = (markup: string, code = ''): string =>
  `${code}<app-host>\n  <template shadowrootmode="open">\n    ${markup}\n  </template>\n</app-host>\n`;

/** A `@client` that declares two reactives and one handler, with no package to import from. */
const CLIENT = `@code {
  @client {
    type Signal<T> = { (): T };
    declare function signal<T>(v: T): Signal<T>;
    const titulo = signal('Hola');
    const doble = computed(() => 2);
    const plano = 'x';
    function onClick(ev: MouseEvent): void { void ev; }
  }
}

`;

describe('the dangling dot is copied (task 10)', () => {
  it('carries the `.` into the projection, in content', () => {
    expect(project(component('<p>@data.</p>'))).toContain('$text(data.);');
  });

  it('and in an attribute value, which goes through the same copy', () => {
    expect(project(component('<div id="@data."></div>'))).toContain('$attr(data.);');
  });

  it('carries an optional access whole, both characters of it', () => {
    expect(project(component('<p>@data?.</p>'))).toContain('$text(data?.);');
  });

  it('says nothing extra when the chain ends on a name', () => {
    expect(project(component('<p>@data.title</p>'))).toContain('$text(data.title);');
  });

  it('maps it under completion alone: the user is asking, not being told', () => {
    const source = component('<p>@data.</p>');
    const [client] = emitVirtualFiles({
      source,
      fileName: 'x.fud',
      document: parseFud(source),
      registry: BADGE,
    });
    const dot = client!.mappings.find(
      (m) => source.slice(m.sourceOffset, m.sourceOffset + m.sourceLength) === '.',
    );

    expect(dot?.caps).toEqual({
      completion: true,
      verification: false,
      semantic: false,
      navigation: false,
      structure: false,
      format: false,
    });
  });
});

describe('a handler that is a call is a deferred invocation (task 11)', () => {
  it('wraps it in the arrow whose parameter IS `$event`', () => {
    expect(project(component('<div @click="@onClick($event)"></div>', CLIENT))).toContain(
      "$on('click', ($event) => onClick($event));",
    );
  });

  it('copies a bare reference as it is', () => {
    expect(project(component('<div @click="@onClick"></div>', CLIENT))).toContain(
      "$on('click', onClick);",
    );
  });

  it('copies a lambda as it is', () => {
    expect(project(component('<div @click="@((e) => onClick(e))"></div>', CLIENT))).toContain(
      "$on('click', (e) => onClick(e));",
    );
  });

  it('leaves a value that can be no listener alone — FUD0291 is the compiler’s to say', () => {
    expect(project(component('<div @click="@(1)"></div>', CLIENT))).toContain("$on('click', 1);");
  });

  it('defers a `bus:` call the same way, with the event given up as never', () => {
    expect(project(component('<div bus:cart="@onClick($event)"></div>', CLIENT))).toContain(
      "$on('cart' as never, ($event) => onClick($event));",
    );
  });

  it('leaves a half-written value alone: an empty span registers no fragment', () => {
    expect(project(component('<div @click="@()"></div>', CLIENT))).toContain("$on('click',  );");
  });
});

describe('a reactive is projected as its READ (task 27)', () => {
  it('hands a `.prop` to the child’s own type, which is what decides the form (BUG-24)', () => {
    // It used to write `tone: (titulo()),` here, because decision 84 crossed the read and
    // nothing else. Since decision 105 the form depends on what the CHILD declared, and the
    // projection asks the one reader that knows: `$cross` takes the object or its read, and
    // `$Prop` is the declared type of that very prop.
    expect(project(component('<app-badge .tone="@titulo"></app-badge>', CLIENT))).toContain(
      'tone: $cross<$Prop<$C0, "tone">>(titulo),',
    );
  });

  it('and on a plain attribute of a COMPONENT host, which is HTML’s vocabulary', () => {
    // Not a prop, so no contract decides anything: an attribute carries a string on every
    // level, and the emit crosses the read there whatever the child declares (BUG-24 §4.7).
    expect(project(component('<app-badge id="@titulo"></app-badge>', CLIENT))).toContain(
      'id: (titulo()),',
    );
  });

  it('and on a plain interpolated attribute, the emit’s other crossing site', () => {
    expect(project(component('<div id="@titulo"></div>', CLIENT))).toContain('$attr(titulo());');
  });

  it('counts a `computed` too: what makes a name reactive is the callee', () => {
    expect(project(component('<div id="@doble"></div>', CLIENT))).toContain('$attr(doble());');
  });

  it('leaves a name that is not reactive alone', () => {
    expect(project(component('<div id="@plano"></div>', CLIENT))).toContain('$attr(plano);');
  });

  it('leaves a value that merely READS one alone: it is not a bare name', () => {
    expect(project(component('<div id="@(titulo())"></div>', CLIENT))).toContain(
      '$attr(titulo());',
    );
    expect(project(component('<div id="@(titulo() + 1)"></div>', CLIENT))).toContain(
      '$attr(titulo() + 1);',
    );
  });

  it('leaves TEXT alone, because the emit does not cross there either (§2.8)', () => {
    expect(project(component('<p>@titulo</p>', CLIENT))).toContain('$text(titulo);');
  });

  it('adds no mapping for the `()`: the author never typed it', () => {
    const source = component('<div id="@titulo"></div>', CLIENT);
    const [client] = emitVirtualFiles({
      source,
      fileName: 'x.fud',
      document: parseFud(source),
      registry: BADGE,
    });
    const call = client!.text.indexOf('$attr(titulo());') + '$attr(titulo'.length;

    expect(client!.mappings.some((m) => m.generatedOffset === call)).toBe(false);
  });
});

describe('$required, and the silences it keeps (task 9)', () => {
  it('names the props that WERE written, so the type argument computes the rest', () => {
    expect(project(component('<app-badge .tone="a" .other="b"></app-badge>'))).toContain(
      "$required<$C0, 'tone' | 'other'>({});",
    );
  });

  it('ignores a dot with no name behind it: it names no prop', () => {
    expect(project(component('<app-badge .></app-badge>'))).toContain('$required<$C0, never>({});');
  });

  it('says nothing at all for a tag with no <link>', () => {
    expect(project(component('<app-missing></app-missing>'))).not.toContain('$required');
  });
});

describe('the slot is the parent’s (task 12)', () => {
  // ONE character, and the anchor behind it is zero-length at the caret. A stretch covering the
  // whole `slot=""` is seven source characters against two generated ones, and Volar maps with
  // `Math.min(relativePos, generatedLength)` — so the caret landed past the hole, on the closing
  // quote, where nothing is offered. That is why the slot list only appeared after a letter.
  it('anchors an empty value so the list can be asked for', () => {
    expect(project(component('<app-badge><div slot=""></div></app-badge>'))).toContain(
      "$intoSlot<$S0>(' ');",
    );
  });

  it('anchors a `slot` with no `=` on the attribute itself, since it has no value span', () => {
    // `<div slot>` is `slot=""` (decision 44) with nothing between quotes that were never
    // typed, so the inside of the value does not exist and the name falls back to the
    // attribute. The call is the same one: the position still asks for the parent's slots.
    const source = component('<app-badge><div slot></div></app-badge>');
    const [client] = emitVirtualFiles({
      source,
      fileName: 'x.fud',
      document: parseFud(source),
      registry: BADGE,
    });

    expect(client!.text).toContain("$intoSlot<$S0>(' ');");
    expect(
      client!.mappings.some(
        (m) => m.sourceOffset === source.indexOf('slot>') && m.sourceLength === 0 && m.length === 1,
      ),
    ).toBe(true);
  });

  it('projects nothing for a name assembled out of several parts', () => {
    expect(project(component('<app-badge><div slot="a-@x"></div></app-badge>'))).not.toContain(
      '$intoSlot',
    );
  });

  it('keeps the parent through a control body, three constructs deep', () => {
    expect(
      project(component('<app-badge>@if (true) { <div slot="meta"></div> }</app-badge>')),
    ).toContain('$intoSlot<$S0>("meta");');
  });
});

/**
 * The `@` the author has just pressed, in the three places it can be pressed.
 *
 * None of them is a `RazorExpression`: the tokenizer scans one only where an identifier
 * begins, so `@click=@` degrades to a plain attribute, `.name=@` to a value whose text is
 * `"@"`, and `<p>hola @</p>` stays a text node. Three shapes with nothing to copy — and the
 * projection has to leave a hole in each anyway, because that is the exact position where the
 * editor is being asked. A hole is a ZERO-LENGTH anchor at the caret, mapped for completion
 * alone: Volar maps with `Math.min(relativePos, generatedLength)`, so anything wider pushes
 * the caret past it.
 */
describe('a `@` that opens nothing yet still gets a hole (tasks 2, 3, 5)', () => {
  /** The zero-length stretch anchored at `at`, as `{ sourceLength, length, caps }`. */
  const holeAt = (source: string, at: number): unknown => {
    const [client] = emitVirtualFiles({
      source,
      fileName: 'x.fud',
      document: parseFud(source),
      registry: BADGE,
    });
    const mapping = client!.mappings.find((m) => m.sourceOffset === at && m.sourceLength === 0);
    return mapping === undefined
      ? undefined
      : { sourceLength: mapping.sourceLength, length: mapping.length, caps: mapping.caps };
  };

  it('projects the handler of an event whose value was opened and not written', () => {
    expect(project(component('<div @click=@></div>'))).toMatch(/\$on\('click', {2}\);/u);
  });

  it('and of one written with quotes, which is the same commitment', () => {
    expect(project(component('<div @click=""></div>'))).toMatch(/\$on\('click', {2}\);/u);
    expect(project(component('<div @click="@"></div>'))).toMatch(/\$on\('click', {2}\);/u);
  });

  it('but not of a name with no `=` at all: nothing has been committed to yet', () => {
    expect(project(component('<div @click></div>'))).toContain("$on('click');");
  });

  it('projects a bare `@` in a value as the empty expression it is, never as the string `"@"`', () => {
    const text = project(component('<app-badge .name=@></app-badge>'));

    expect(text).toContain('name: ( ),');
    expect(text).not.toContain('name: "@"');
  });

  it('and the same one written with quotes, which is the same commitment', () => {
    // The two spellings are one grammar (decision 103), so they cannot project differently:
    // `.name="@"` reaches a different branch and has to arrive at the same hole.
    const text = project(component('<app-badge .name="@"></app-badge>'));

    expect(text).toContain('name: ( ),');
    expect(text).not.toContain('name: "@"');
  });

  it('and on a PLAIN attribute of a component, where the value is HTML’s', () => {
    expect(project(component('<app-badge id="@"></app-badge>'))).toContain('id: ( ),');
  });

  it('keeps projecting a real literal as a literal', () => {
    expect(project(component('<app-badge .name="x"></app-badge>'))).toContain('name: "x",');
  });

  it('gives the `@` at the end of a text node a `$text` hole', () => {
    expect(project(component('<p>hola @</p>'))).toContain('$text( );');
  });

  it('and gives it to the `@` a sentence was interrupted with, which is the same caret', () => {
    // `<p>a @| b</p>`: the at-transition ends the text node at the `@`, so what precedes the
    // caret is `a @` and the author is asking there just as much.
    expect(project(component('<p>a @ b</p>'))).toContain('$text( );');
  });

  it('and says nothing for the `@` that is not one: escaped, or glued to a word', () => {
    // `@@` is the literal of decision 1 and `hola@` is an address somebody wrote: in neither
    // is the `@` a construct being opened.
    expect(project(component('<p>@@</p>'))).not.toContain('$text(');
    expect(project(component('<p>hola@</p>'))).not.toContain('$text(');
  });

  it('anchors every one of them at the caret, zero-length and for completion alone', () => {
    const caps = {
      completion: true,
      verification: false,
      semantic: false,
      navigation: false,
      structure: false,
      format: false,
    };
    const handler = component('<div @click=@></div>');
    const value = component('<app-badge .name=@></app-badge>');
    const text = component('<p>hola @</p>');

    const hole = { sourceLength: 0, length: 1, caps };

    expect(holeAt(handler, handler.indexOf('@click=@') + '@click=@'.length)).toEqual(hole);
    expect(holeAt(value, value.indexOf('.name=@') + '.name=@'.length)).toEqual(hole);
    expect(holeAt(text, text.indexOf('hola @') + 'hola @'.length)).toEqual(hole);
  });
});

/**
 * The four shapes a value can take that are not a program, and the one that is a mistake.
 *
 * A value the author has committed to and not written, one they opened with a `@` inside a
 * longer literal, one the parser already rejected, and one that is a finished literal where a
 * listener goes. None of the first three may be CHECKED against anything — there is nothing
 * there to check — and all three have to be a place the editor can ask from.
 */
describe('a value that is not there yet, and the one that is wrong', () => {
  it('gives `.name=` a hole, because the `=` is the author asking what goes right of it', () => {
    // A bare attribute is `true` (decision 44). `.name=` is not bare: the equals sign was
    // written and nothing followed it, which is the one moment the question is being asked.
    const text = project(component('<app-badge .name=></app-badge>'));

    expect(text).toContain('name: ( ),');
    expect(text).not.toContain('name: true');
  });

  it('and gives it to `.name=""`, which is the same commitment written with quotes', () => {
    expect(project(component('<app-badge .name=""></app-badge>'))).toContain('name: ( ),');
  });

  it('but leaves a bare `.name` as `true`, which is what it means', () => {
    expect(project(component('<app-badge .name></app-badge>'))).toContain('name: true');
  });

  it('checks nothing on a value the parser already rejected (FUD0056)', () => {
    // `.name=.` is `FUD0056` and the compiler says so. Projecting `name: "."` added «string is
    // not assignable» underneath it: two errors for one mistake, and the type one pointing at
    // a contract the author had written correctly.
    const text = project(component('<app-badge .name=.></app-badge>'));

    expect(text).toContain('name: ( ),');
    expect(text).not.toContain('name: "."');
  });

  it('puts the hole INSIDE the literal when the `@` opens one further in', () => {
    // `.name="/a/@|"` is a URL with a slug in it: the value still has to typecheck as a
    // string, so the question gets somewhere to ask from without the literal losing its type.
    // Two parts — the run and the at-sign — so it is the concatenation path that has to know.
    expect(project(component('<app-badge .name="/a/@"></app-badge>'))).toContain(
      'name: `/a/${ }`,',
    );
    // And one part, when the `@` is glued to a word and the tokenizer never splits it.
    expect(project(component('<app-badge .name="hola@"></app-badge>'))).toContain(
      'name: `hola${ }`,',
    );
  });

  it('and keeps the hole after a real interpolation, which is the same value going on', () => {
    expect(project(component('<app-badge .name="@data.title/@"></app-badge>'))).toContain(
      '${ }`,',
    );
  });

  it('and does the same in a NATIVE tag, where nothing else was projecting it', () => {
    // The loop over a native tag only writes an `$attr` per interpolation, and a `@` with
    // nothing behind it is not one — so this position had nowhere to ask from at all.
    expect(project(component('<div role="@"></div>'))).toContain('$attr( );');
    expect(project(component('<div title="/a/@"></div>'))).toContain('$attr( );');
  });

  it('leaves a finished literal alone, and an ESCAPED at-sign is finished', () => {
    // `@@` is the literal at-sign of decision 1. The parser resolves it to the one character
    // it denotes, so by its text it is indistinguishable from an open `@` — and reading the
    // text alone put a completion hole inside a value where nothing had been asked.
    expect(project(component('<div role="hola"></div>'))).not.toContain('$attr( );');
    expect(project(component('<div role="hola@@"></div>'))).not.toContain('$attr( );');
    expect(project(component('<app-badge .name="@@"></app-badge>'))).toContain('name: "@",');
    expect(project(component('<app-badge .name="hola@@"></app-badge>'))).not.toContain('${ }');
  });

  it('reports a finished literal where a listener goes, over the author’s own characters', () => {
    // `@click="Hello"` is not a handler being written, it is a handler that is wrong — and
    // until now the projection dropped it for the anchor, so nothing complained anywhere.
    const text = project(component('<div @click="Hello"></div>'));

    expect(text).toContain('$on(\'click\', "Hello");');
  });

  it('and keeps the quotes out of it when the author wrote none', () => {
    // Unquoted is `FUD0056` already, and a type error underneath the compiler's own message is
    // the same mistake reported twice.
    expect(project(component('<div @click=Hello></div>'))).toMatch(/\$on\('click', {2}\);/u);
  });
});

/**
 * `.name="@data."` — one expression being written, and the parser says so twice.
 *
 * The atom carries `dangling` (decision 102) and the same dot arrives again as the literal run
 * that follows, because for the OUTPUT that dot is text (decision 2). Counting both made the
 * value a concatenation, projected as a template literal, and there the dangling is nobody's:
 * the caret after the dot landed on a literal run with no completion.
 */
describe('the dangling dot does not make a value a concatenation (task 10)', () => {
  it('projects the quoted form as the lone expression it is', () => {
    const text = project(component('<app-badge .name="@data."></app-badge>'));

    expect(text).toContain('name: (data.),');
    expect(text).not.toContain('`${');
  });

  it('and the unquoted one identically, which is what makes the two spellings agree', () => {
    expect(project(component('<app-badge .name=@data.></app-badge>'))).toContain('name: (data.),');
  });

  it('leaves a real concatenation as one: the trailing text is not the dangling dot', () => {
    // No dangling at all here — the chain ends on a name — so the run after it is text like
    // any other and the value is the concatenation it looks like.
    expect(project(component('<app-badge .name="@data.title x"></app-badge>'))).toContain('${');
  });

  it('and one where the dot is only the START of the trailing run', () => {
    // `@data. x` breaks the chain on the dot exactly as `@data.` does, but the run does not
    // END there: what follows is a sentence, so dropping it would drop the sentence too.
    const text = project(component('<app-badge .name="@data. x"></app-badge>'));

    expect(text).toContain('${');
    expect(text).toContain('. x');
  });
});
