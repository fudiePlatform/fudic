/**
 * SDD-66 §4.3 — criterion 17: nobody adds a generator without checking that what it writes passes
 * green. Every type `fudic g` takes is run by a step of `pnpm verify:generated`, and every step is
 * a command the CLI understands.
 */

import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GENERATE_TYPES, parseArgs } from '../src/args.js';

interface Step {
  readonly in: string;
  readonly argv: readonly string[];
  readonly covers?: string;
}

const SCRIPT = fileURLToPath(new URL('../../../scripts/verify-generated.mjs', import.meta.url));

/** The table of the script. Imported by URL: it is a `.mjs` of the root, outside this package. */
async function steps(): Promise<readonly Step[]> {
  return ((await import(pathToFileURL(SCRIPT).href)) as { STEPS: readonly Step[] }).STEPS;
}

describe('the table of verify:generated', () => {
  it('runs every type of generator the CLI takes', async () => {
    const covered = new Set((await steps()).flatMap((step) => (step.covers === undefined ? [] : [step.covers])));
    const types = [...new Set(Object.values(GENERATE_TYPES))].sort();
    expect(types.filter((type) => !covered.has(type))).toEqual([]);
  });

  it('every step is a command the CLI parses, and the generator it says it covers is the one it runs', async () => {
    for (const step of await steps()) {
      const parsed = parseArgs([...step.argv]);
      expect(parsed.kind, step.argv.join(' ')).not.toBe('error');
      if (step.covers !== undefined) expect(GENERATE_TYPES[step.argv[1]!], step.argv.join(' ')).toBe(step.covers);
    }
  });

  it('starts each workspace with fudic new, before any step runs inside it', async () => {
    const table = await steps();
    const made = new Set(['.']);
    for (const step of table) {
      expect(made.has(step.in), `${step.argv.join(' ')} runs in ${step.in}`).toBe(true);
      if (step.argv[0] === 'new') made.add(step.argv[1]!);
    }
  });
});
