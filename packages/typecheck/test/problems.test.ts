/**
 * `@fudic/typecheck/problems` — the light entry.
 *
 * What a host needs to print, compare or position a problem, without the machine that finds
 * one: loading `typescript` costs most of a second, and `vite preview` never checks anything.
 * So the entry is asserted two ways — it is the SAME functions as the main entry, and nothing
 * it loads at run time reaches TypeScript or Volar.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as full from '../src/index.js';
import * as problems from '../src/problems.js';

const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

/**
 * Every bare specifier a module loads at run time, following its relative imports. An
 * `import type` is erased; any other `import`/`export … from` stays (with
 * `verbatimModuleSyntax`, even one whose names are all `type`).
 */
function runtimeSpecifiers(entry: string): Set<string> {
  const bare = new Set<string>();
  const seen = new Set<string>();
  const visit = (file: string): void => {
    if (seen.has(file)) {
      return;
    }
    seen.add(file);
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/^(?:import|export)\s+(type\s+)?[^;]*?from\s+'([^']+)'/gmsu)) {
      const [, typeOnly, specifier] = match as unknown as [string, string | undefined, string];
      if (typeOnly !== undefined) {
        continue;
      }
      if (specifier.startsWith('.')) {
        visit(join(dirname(file), specifier.replace(/\.js$/u, '.ts')));
      } else {
        bare.add(specifier);
      }
    }
  };
  visit(entry);
  return bare;
}

describe('@fudic/typecheck/problems', () => {
  it('is the same functions as the main entry', () => {
    expect(problems.compareProblems).toBe(full.compareProblems);
    expect(problems.hasErrors).toBe(full.hasErrors);
    expect(problems.formatProblem).toBe(full.formatProblem);
    expect(problems.locateProblem).toBe(full.locateProblem);
    expect(problems.relativePath).toBe(full.relativePath);
    expect(problems.toPosix).toBe(full.toPosix);
  });

  it('loads neither TypeScript nor Volar', () => {
    const loaded = [...runtimeSpecifiers(join(src, 'problems.ts'))];
    expect(loaded.filter((s) => s === 'typescript' || s.startsWith('@volar/'))).toEqual([]);
  });

  it('the walk itself sees them from the main entry — the assertion above is not vacuous', () => {
    const loaded = runtimeSpecifiers(join(src, 'index.ts'));
    expect(loaded.has('typescript')).toBe(true);
  });
});
