import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The invariant, checked the only way a text invariant can be checked: by looking.
 *
 * The container hierarchy is emitted code and a published map, and it may NEVER be derived
 * from the element tree. Two reasons and each one is enough. The owning ancestor can be N1 —
 * it declares providers, injects nothing, and runs not a line in the browser — so climbing
 * the DOM would find its element and find no container, and resolution would either fail or,
 * worse, go one level too far and hand back the global instance where the ancestor's was
 * due. And the hydration cascade climbs by TAG, in post-order, so when a component wakes up
 * neither its parent nor its owning ancestor need be alive.
 *
 * The list of exceptions is empty, and that is the point of writing it down.
 */
const FORBIDDEN = ['getRootNode', 'closest', 'parentElement', '.host'];

const dir = fileURLToPath(new URL('../src', import.meta.url));

/** Every source file of the package, comments included: a comment is not an escape hatch. */
const sources = readdirSync(dir)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => [f, readFileSync(`${dir}/${f}`, 'utf8')] as const);

describe('@fudic/di never asks the DOM who a container hangs from', () => {
  it('has sources to look at', () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  for (const [file, source] of sources) {
    it(`${file} names none of the DOM walkers`, () => {
      expect(FORBIDDEN.filter((name) => source.includes(name))).toEqual([]);
    });
  }
});
