/**
 * Acceptance criteria 1, 4 and 5: idempotence, stability and broken files.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { format } from '../../src/index.js';
import { attempt, broken, corpus, formatted } from './_corpus.js';

describe('criterion 1 — idempotence', () => {
  it.each(corpus)('fmt(fmt(x)) === fmt(x) on $name', async (fixture) => {
    const once = await formatted(fixture);
    const twice = await format(once);
    expect(twice.ok && twice.text).toBe(once);
  });
});

describe('criterion 4 — stability over an already formatted file', () => {
  it.each(corpus)('$name comes back unchanged once it is in canonical form', async (fixture) => {
    // This is what `fudic fmt --check` exits zero on: the second pass has nothing to say.
    const once = await formatted(fixture);
    const second = await format(once);
    expect(second.ok).toBe(true);
    expect(second.ok && second.text === once).toBe(true);
  });

  it('every corpus file survives its own canonical form under a narrower margin too', async () => {
    for (const fixture of corpus) {
      const once = await format(fixture.source, { printWidth: 60 });
      expect(once.ok).toBe(true);
      const twice = await format(once.ok ? once.text : '', { printWidth: 60 });
      expect(twice.ok && twice.text).toBe(once.ok ? once.text : '');
    }
  });
});

describe('the corpus formats without a single note', () => {
  /**
   * One fixture is expected to note, and it is the one written to: a `@*…*@` inside a
   * `@code` body is content for the leaf, which reads it as JavaScript and finds none. The
   * block then stays exactly as its author wrote it, with FUD0481 saying so.
   */
  const silent = corpus.filter((fixture) => fixture.name !== 'own/comments.fud');

  it.each(silent)('$name leaves nothing unformatted', async (fixture) => {
    // A note is the formatter admitting it left something as it found it (FUD0480/FUD0481),
    // and on a corpus of files that all parse there should be nothing to admit. It is also
    // the only signal that would catch a leaf misconfigured rather than broken: the fallback
    // hands back the author's text, so the output still looks plausible.
    const result = await format(fixture.source);
    expect(result.ok && result.notes).toEqual([]);
  });
});

describe('criterion 5 — files that do not parse', () => {
  it.each(broken)('$name is refused, with diagnostics and no exception', async (fixture) => {
    const result = await attempt(fixture);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.diagnostics.length).toBeGreaterThan(0);
  });

  it('leaves every broken file on disk exactly as it was', async () => {
    for (const fixture of broken) {
      await attempt(fixture);
      expect(readFileSync(fixture.path, 'utf8')).toBe(fixture.source);
    }
  });
});
