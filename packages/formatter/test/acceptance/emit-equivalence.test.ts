/**
 * Acceptance criterion 3 — the hard test.
 *
 * The HTML the runtime emitter produces for `x` and for `fmt(x)` must be the same document.
 * Any whitespace-sensitivity bug lands here and NOWHERE else: neither the AST round-trip nor
 * the idempotence can see it, because the tree can be identical and the render different.
 *
 * It is only possible because the emitter is in this repository. That is the structural
 * advantage this project has over any third-party formatter, and it is worth the harness.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { format } from '../../src/index.js';
import { corpus, formatted } from './_corpus.js';
import { domSignature, emitModule, textSignature } from './_emit.js';

const read = (path: string): string => readFileSync(path, 'utf8');

describe('criterion 3 — the emit is the same document before and after', () => {
  it.each(corpus)('$name builds the same DOM, run for run', async (fixture) => {
    const before = emitModule(fixture.path, fixture.source, read);
    const after = emitModule(fixture.path, await formatted(fixture), read);
    expect(domSignature(after)).toEqual(domSignature(before));
  });

  it.each(corpus)('$name bakes the same text, run for run', async (fixture) => {
    const before = emitModule(fixture.path, fixture.source, read);
    const after = emitModule(fixture.path, await formatted(fixture), read);
    expect(textSignature(after)).toEqual(textSignature(before));
  });

  it('holds at a margin narrow enough to force every break the printer has', async () => {
    for (const fixture of corpus) {
      const narrow = await format(fixture.source, { printWidth: 40 });
      expect(narrow.ok).toBe(true);
      const before = emitModule(fixture.path, fixture.source, read);
      const after = emitModule(fixture.path, narrow.ok ? narrow.text : '', read);
      expect(domSignature(after)).toEqual(domSignature(before));
    }
  });
});

describe('the oracle is not vacuous', () => {
  const badge = corpus.find((f) => f.name === 'lsp/blog/[slug].fud')!;

  it('sees a run created where there was none', () => {
    // This is the bug the criterion exists for: a break between an interpolation and the
    // close tag renders as a space that was not there.
    const broken = badge.source.replace('>@data.tag<', '>\n      @data.tag\n    <');
    const before = emitModule(badge.path, badge.source, read);
    const after = emitModule(badge.path, broken, read);
    expect(textSignature(after)).not.toEqual(textSignature(before));
  });

  it('does NOT see a run merely rewritten', () => {
    // Reindenting a block child changes the bytes of the emit and nothing about the render.
    const reindented = badge.source.replace('\n  <app-badge', '\n      <app-badge');
    const before = emitModule(badge.path, badge.source, read);
    const after = emitModule(badge.path, reindented, read);
    expect(textSignature(after)).toEqual(textSignature(before));
  });

  it('sees an element or an attribute go missing', () => {
    const stripped = badge.source.replace('<h1>@data.title</h1>', '');
    const before = emitModule(badge.path, badge.source, read);
    const after = emitModule(badge.path, stripped, read);
    expect(domSignature(after)).not.toEqual(domSignature(before));
  });
});
