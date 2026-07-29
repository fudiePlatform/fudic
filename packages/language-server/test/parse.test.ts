/**
 * The parse the server runs on (SDD-24 §4.5).
 *
 * Two things matter here and nothing else: it is the compiler's own pipeline, and it hands
 * back the diagnostics instead of throwing them — a half-written file is the normal state of
 * an editor, and it still has to yield a tree.
 */

import { describe, expect, it } from 'vitest';
import { parseFud } from '../src/parse.js';
import { component, LAYOUT } from './_support.js';

describe('parseFud', () => {
  it('parses a component with no complaints', () => {
    const { document, diagnostics } = parseFud(component('app-badge'));

    expect(document.type).toBe('component-document');
    expect(diagnostics).toEqual([]);
  });

  it('wires the @ constructs: a layout keeps its directives', () => {
    const { document } = parseFud(LAYOUT);

    expect(document.type).toBe('layout-document');
  });

  it('reads @code, which only the code-block parser can produce', () => {
    const source = `@code {\n  const { tone = 'x' } = props<{ tone?: string }>();\n}\n${component('app-badge')}`;

    expect(parseFud(source).document.code).toBeDefined();
  });

  it('yields a tree AND diagnostics for broken input, never a throw', () => {
    const { document, diagnostics } = parseFud('<div><app-badge>\n');

    expect(document).toBeDefined();
    expect(diagnostics.length).toBeGreaterThan(0);
    for (const diagnostic of diagnostics) {
      expect(diagnostic.span.end).toBeGreaterThanOrEqual(diagnostic.span.start);
    }
  });
});
