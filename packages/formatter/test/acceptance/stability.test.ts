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
