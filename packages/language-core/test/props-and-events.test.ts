/**
 * BUG-16 — the two literals of a component tag, and the event name that stopped being
 * scaffolding.
 *
 * In fudic a property is written with a dot and an event with an at-sign, so the projection
 * has to say exactly that: a `.prop` is checked against the component's contract, a plain
 * attribute against HTML's own vocabulary, and the name after the `@` is a stretch of the
 * source the editor can ask about — not text the emitter invented.
 */
import { describe, expect, it } from 'vitest';
import type { VirtualFile } from '../src/types.js';
import { emitClient, registryOf } from './_support.js';

/** A component file wrapping `markup` in the mandatory host + template (decision 75). */
const component = (markup: string): string =>
  `<app-host>\n  <template shadowrootmode="open">\n${markup}\n  </template>\n</app-host>\n`;

const registry = registryOf({ 'app-badge': './app-badge.fud' });

const project = (markup: string): VirtualFile =>
  emitClient(component(`    ${markup}`), 'x.fud', registry);

describe('the two literals of a component tag (§6.5)', () => {
  it('sends a `.prop` to the contract and a plain attribute to $GlobalAttrs', () => {
    const { text } = project('<app-badge .tone="@(t)" id="x"></app-badge>');

    expect(text).toContain('tone: (t),');
    expect(text).toContain('id: "x",');
    // Both literals, on the same tag, in this order: the contract first.
    expect(text.indexOf('$props<$C0>(')).toBeLessThan(text.indexOf('$attrs<{}>('));
  });

  it('emits the globals literal even with no plain attribute (BUG-23 decision (b))', () => {
    // It is where the gap anchors live now, so `<app-badge |>` must have it even when the tag
    // carries nothing HTML would recognise: what goes in that gap IS HTML's vocabulary.
    expect(project('<app-badge .tone="@(t)"></app-badge>').text).toContain('$attrs<{}>({');
  });

  it('emits an empty contract literal when the tag has only plain attributes', () => {
    const { text } = project('<app-badge id="x"></app-badge>');

    expect(text).toContain('$props<$C0>({});');
    expect(text).toContain('id: "x",');
  });

  it('keeps `slot` out of both, checked by $intoSlot against the PARENT (§6.7)', () => {
    // The parent is what declares the slot (BUG-23 §2.6), so the badge goes inside a
    // component host: at the top of a shadow template it fills nothing at all.
    const { text } = emitClient(
      component('    <app-card><app-badge slot="meta" .tone="@(t)"></app-badge></app-card>'),
      'x.fud',
      registryOf({ 'app-badge': './app-badge.fud', 'app-card': './app-card.fud' }),
    );

    // `$S0` is the CARD: aliases are numbered by the order the tags appear in the markup.
    expect(text).toContain('$intoSlot<$S0>("meta");');
    expect(text).not.toContain('slot: ');
  });

  it('checks a slot written with no component parent against never', () => {
    // `never` is exactly what a `slot=` outside a host fills, and saying so is what makes
    // `<div slot="PEPITO">` in the middle of a page an error at last.
    expect(project('<div slot="meta"></div>').text).toContain('$intoSlot<never>("meta");');
  });

  it('a native tag is unaffected: only its interpolations are checked', () => {
    const { text } = project('<input .value="@(v)" id="a">');

    expect(text).toContain('$attr(v);');
    expect(text).not.toContain('$attrs<');
  });
});

describe('the event name is projected, not invented (§4.4)', () => {
  /** The mapping that stands for a projected literal name: completion + verification only. */
  const nameStretch = (file: VirtualFile) =>
    file.mappings.filter(
      (m) => m.caps.completion === true && m.caps.verification && !m.caps.navigation,
    );

  it('writes the name as a stretch that measures 1:1 with the source', () => {
    const source = component('    <app-badge @click="@onClick"></app-badge>');
    const file = emitClient(source, 'x.fud', registry);

    expect(file.text).toContain("$on('click', onClick);");

    // The quotes stay OUT of it. TypeScript hands the replacement range back without them, so
    // both of its ends already fall inside this one stretch — and a stretch two characters
    // longer than what it stands for shifts every offset in it: the range for `@cli` would
    // come back over `li`, and accepting `click` would write `@cclick`.
    const stretch = nameStretch(file).find((m) => m.length === 'click'.length);
    expect(stretch).toBeDefined();
    // It stands for the bare name — the `@` opens the binding and is not part of it.
    expect(stretch!.sourceLength).toBe('click'.length);
    expect(source.slice(stretch!.sourceOffset, stretch!.sourceOffset + stretch!.sourceLength)).toBe(
      'click',
    );
  });

  it('keeps `as never` for a custom event, and outside the literal', () => {
    const { text } = project('<app-badge @my-press="@h"></app-badge>');

    expect(text).toContain("$on('my-press' as never, h);");
  });

  it('anchors the literal when the `@` names nothing yet', () => {
    // `@="@h"` is already FUD0099, but it is also where the developer is standing, so the
    // inside of the literal becomes a completion anchor rather than a name.
    const file = project('<app-badge @="@h"></app-badge>');

    expect(file.text).toContain("$on(' ', h);");
    // An anchor, not a name: it offers and it does not report.
    expect(nameStretch(file)).toEqual([]);
  });
});
