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
  it('adds the call the emit adds, on a `.prop`', () => {
    expect(project(component('<app-badge .tone="@titulo"></app-badge>', CLIENT))).toContain(
      'tone: (titulo()),',
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
