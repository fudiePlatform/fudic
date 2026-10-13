/**
 * `...item` in the editor (props-spec §5): projected as `$spread<Omit<$C, 'written'>>(item)`.
 *
 * The emit applies decisions 79–82 at runtime; this is where TypeScript reads the same rules
 * off the child's `T`, measured with the real checker over the projected corpus. A required key
 * the object lacks is `TS2345` ON the object; an optional one it lacks is fine; an extra one
 * passes (decision 80); a key written explicitly on the tag is not asked of the object. And a
 * bare `...` is an anchor that offers the names in scope.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapToGenerated } from '../src/mapping.js';
import { languageServiceFor, projectCorpus, typecheckCorpus } from './typecheck.js';

const FIXTURES = resolve(fileURLToPath(new URL('../fixtures', import.meta.url)));
const SLUG = 'blog/[slug].fud';
const BADGE = 'components/app-badge.fud';
const read = (path: string): string => readFileSync(resolve(FIXTURES, path), 'utf8');

/**
 * What the author SEES: the complaints that map back onto the `.fud`. The editor and the build
 * both drop one that lands in scaffolding, and `$props<$C0>({})` always yields one when a
 * required key is not written on the tag — with or without a spread, so it is no part of this.
 */
const seen = (files: Record<string, string>): ReturnType<typeof typecheckCorpus> =>
  typecheckCorpus(files).filter((d) => d.sourceOffset !== undefined);

/** `app-badge` with a REQUIRED `label` beside its optional `tone`. */
const badge = read(BADGE).replace('props<{ tone?: Tone }>()', 'props<{ tone?: Tone; label: string }>()');

/** The corpus with `decl` in the slug page's `@code` and `host` in place of its badge. */
function withHost(decl: string, host: string): Record<string, string> {
  return {
    [BADGE]: badge,
    [SLUG]: read(SLUG)
      .replace('  type PageData', `${decl}\n  type PageData`)
      .replace(/<app-badge[^>]*>/u, host),
  };
}

describe('the object is checked against the child´s contract', () => {
  it('every required key there, an extra one beside it: no error (79, 80)', () => {
    const decl = "  const b = { label: 'x', tone: 'info' as const, sku: 'K-01' };";
    expect(seen(withHost(decl, '<app-badge ...b>'))).toEqual([]);
  });

  it('an optional key missing is fine: the child´s default takes it (82)', () => {
    const decl = "  const b = { label: 'x' };";
    expect(seen(withHost(decl, '<app-badge ...b>'))).toEqual([]);
  });

  it('a required key missing is TS2345, on the object (82)', () => {
    const decl = "  const b = { tone: 'info' as const };";
    const diags = seen(withHost(decl, '<app-badge ...b>'));
    expect(diags).toHaveLength(1);
    expect(diags[0]!.code).toBe(2345);
    expect(diags[0]!.sourceText).toBe('b');
  });

  it('a key of the wrong type is an error too', () => {
    const decl = '  const b = { label: 1 };';
    const diags = seen(withHost(decl, '<app-badge ...b>'));
    expect(diags.map((d) => [d.code, d.sourceText])).toEqual([[2345, 'b']]);
  });

  it('a key the tag writes itself is not asked of the object', () => {
    const decl = "  const b = { tone: 'info' as const };";
    expect(seen(withHost(decl, '<app-badge ...b .label="x">'))).toEqual([]);
  });

  it('a property path is one object, checked the same', () => {
    const decl = "  const r = { data: { tone: 'info' as const } };";
    const diags = seen(withHost(decl, '<app-badge ...r.data>'));
    expect(diags.map((d) => [d.code, d.sourceText])).toEqual([[2345, 'r.data']]);
  });

  it('a malformed spread is the compiler´s to report (FUD0991): TypeScript stays quiet', () => {
    const decl = "  const b = { label: 'x' };";
    expect(seen(withHost(decl, '<app-badge ...a-b .label="x">'))).toEqual([]);
  });
});

describe('a bare `...` is a completion anchor', () => {
  it('offers the names in scope right after the dots', () => {
    const files = withHost("  const elegido = { label: 'x' };", '<app-badge ...>');
    const source = files[SLUG]!;
    const offset = source.indexOf('<app-badge ...') + '<app-badge ...'.length;
    const virtual = projectCorpus(files).find((p) => p.file.path === SLUG)!.virtuals[0]!;
    const at = mapToGenerated(virtual, offset, 'completion');
    expect(at, 'the position maps into the projection').toBeDefined();

    const { service, pathOf } = languageServiceFor(files);
    const names = (service.getCompletionsAtPosition(pathOf(virtual.fileName), at!, undefined)?.entries ?? []).map(
      (e) => e.name,
    );
    expect(names).toContain('elegido');
  });
});
