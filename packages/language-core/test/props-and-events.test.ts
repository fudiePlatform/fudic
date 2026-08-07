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
    expect(text.indexOf('$attrs<$C0>(')).toBeLessThan(text.indexOf('$attrs<{}>('));
  });

  it('emits no second literal when there is no plain attribute', () => {
    expect(project('<app-badge .tone="@(t)"></app-badge>').text).not.toContain('$attrs<{}>');
  });

  it('emits an empty contract literal when the tag has only plain attributes', () => {
    // The anchors still need somewhere to point: a gap of the tag stands for the inside of
    // the CONTRACT literal, which is what SDD-24 §6.3 asks for at `<app-badge |>`.
    const { text } = project('<app-badge id="x"></app-badge>');

    expect(text).toContain('$attrs<$C0>({');
    expect(text).toContain('$attrs<{}>({\n  id: "x",\n});');
  });

  it('keeps `slot` out of both, checked by $intoSlot (§6.7)', () => {
    const { text } = project('<app-badge slot="meta" .tone="@(t)"></app-badge>');

    expect(text).toContain('$intoSlot<$S0>("meta");');
    expect(text).not.toContain('slot: ');
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

  it('writes the name as ONE stretch, quotes included, mapped to the source', () => {
    const source = component('    <app-badge @click="@onClick"></app-badge>');
    const file = emitClient(source, 'x.fud', registry);

    expect(file.text).toContain("$on('click', onClick);");

    const stretch = nameStretch(file).find((m) => m.length === "'click'".length);
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

    expect(file.text).toContain("$on('  ', h);");
    // An anchor, not a name: it offers and it does not report.
    expect(nameStretch(file)).toEqual([]);
  });
});
