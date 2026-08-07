/**
 * BUG-16 §4.3 and §4.4 — the empty cases: `.|` and `@|`.
 *
 * In fudic a property is written with a dot and an event with an at-sign, so the instant the
 * developer types one of the two is the instant the list has to appear. There is no name yet
 * to map from, so each gets an ANCHOR — the recourse BUG-11 used for the gaps of a start tag,
 * one character further in.
 *
 * These are measured against the REAL TypeScript language service over the projection, not
 * against the emitted text: an anchor that maps somewhere no completion answers would look
 * perfect in the virtual and offer nothing in the editor.
 */
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { mapToGenerated } from '../src/mapping.js';
import type { VirtualFile } from '../src/types.js';
import { languageServiceFor, projectCorpus } from './typecheck.js';

const SLUG = 'blog/[slug].fud';

/** Project the corpus with `[slug].fud` rewritten, and hand back its client virtual. */
function projectSlug(markup: string): { source: string; virtual: VirtualFile } {
  const base = projectCorpus().find((p) => p.file.path === SLUG)!.file.source;
  const source = base.replace(/<app-badge[^>]*>/u, markup);
  const entry = projectCorpus({ [SLUG]: source }).find((p) => p.file.path === SLUG)!;
  return { source, virtual: entry.virtuals[0]! };
}

/** What the editor would be offered at `offset` of the `.fud`, through the projection. */
function completionsAt(source: string, offset: number): readonly string[] {
  const { service, pathOf } = languageServiceFor({ [SLUG]: source });
  const entry = projectCorpus({ [SLUG]: source }).find((p) => p.file.path === SLUG)!;
  const virtual = entry.virtuals[0]!;
  const at = mapToGenerated(virtual, offset, 'completion');
  expect(at, 'the position maps into the projection').toBeDefined();

  const info = service.getCompletionsAtPosition(pathOf(virtual.fileName), at!, undefined);
  return (info?.entries ?? []).map((e) => e.name);
}

describe('the dot offers the props of the component (§6.8, §6.9)', () => {
  it('`.|` — with no name yet, the anchor asks the contract', () => {
    const { source } = projectSlug('<app-badge .></app-badge>');
    const names = completionsAt(source, source.indexOf('<app-badge .') + '<app-badge .'.length);

    expect(names).toContain('tone');
  });

  it('`.ton|` — half a name is the same question, filtered by TypeScript', () => {
    const { source } = projectSlug('<app-badge .ton></app-badge>');
    const names = completionsAt(source, source.indexOf('.ton') + '.ton'.length);

    expect(names).toContain('tone');
  });

  it('offers an INSERTION, so the dot is not eaten (§6.8)', () => {
    // The anchor is whitespace inside the object literal, and what TypeScript returns at a
    // position like that replaces nothing: there is no text there to replace. That is what
    // keeps `.` from being swallowed when the item is accepted.
    const { source, virtual } = projectSlug('<app-badge .></app-badge>');
    const at = source.indexOf('<app-badge .') + '<app-badge .'.length;
    const { service, pathOf } = languageServiceFor({ [SLUG]: source });
    const generated = mapToGenerated(virtual, at, 'completion')!;

    const info = service.getCompletionsAtPosition(pathOf(virtual.fileName), generated, undefined);
    const tone = info?.entries.find((e) => e.name === 'tone');
    expect(tone).toBeDefined();
    expect(tone!.replacementSpan).toBeUndefined();
    expect(info!.optionalReplacementSpan?.length ?? 0).toBe(0);
  });
});

describe('the at-sign offers the events of the DOM, without `on` (§6.10, §6.11)', () => {
  it('`@|` — the anchor sits inside the $on literal', () => {
    const { source } = projectSlug('<app-badge @></app-badge>');
    const names = completionsAt(source, source.indexOf('<app-badge @') + '<app-badge @'.length);

    expect(names).toEqual(expect.arrayContaining(['click', 'change', 'input']));
    // The dictionary is typed without `on`, which is how fudic writes an event.
    expect(names.filter((n) => n.startsWith('on'))).toEqual([]);
    // And it is the DOM's list, not the Razor directives: inside a tag an `@` is an event.
    expect(names).not.toContain('if');
    expect(names).not.toContain('foreach');
  });

  it('`@cli|` — half a name filters the same list', () => {
    const { source } = projectSlug('<app-badge @cli></app-badge>');
    const names = completionsAt(source, source.indexOf('@cli') + '@cli'.length);

    expect(names).toContain('click');
  });

  it('a half-written event is not checked as an HTML attribute', () => {
    // It degrades to a plain attribute at classification time, and reporting TS2353 on
    // `@cli` would be reporting a name that is not wrong, only unfinished.
    const { virtual } = projectSlug('<app-badge @cli></app-badge>');

    expect(virtual.text).not.toContain("'@cli'");
    expect(virtual.text).toContain("$on('cli');");
  });
});

describe('the completion item replaces what is written, and no more (§6.9)', () => {
  it('`@cli` is replaced by `click`, not appended to it', () => {
    const { source, virtual } = projectSlug('<app-badge @cli></app-badge>');
    const { service, pathOf } = languageServiceFor({ [SLUG]: source });
    const at = mapToGenerated(virtual, source.indexOf('@cli') + '@cli'.length, 'completion')!;

    const info = service.getCompletionsAtPosition(pathOf(virtual.fileName), at, undefined);
    const click = info?.entries.find((e) => e.name === 'click');
    expect(click).toBeDefined();

    // TypeScript hands back the span of the literal WITHOUT its quotes, which is exactly
    // the stretch that maps back onto `cli` in the source.
    const span = click!.replacementSpan ?? info!.optionalReplacementSpan;
    expect(span).toBeDefined();
    expect(virtual.text.slice(span!.start, span!.start + span!.length)).toBe('cli');
  });
});

/** Keeps `ts` referenced: the harness types come from it and the import must not be elided. */
export const TS_VERSION: string = ts.version;
