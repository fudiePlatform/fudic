/**
 * SDD-59 §6.3.1–2: the workbench knows only `BenchExtension` and `TermHost`. No file of its own —
 * source or test — imports `@fudic/terms`, nor does it depend on it; and it builds no ctx.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const PACKAGE = fileURLToPath(new URL('..', import.meta.url));

/** Every .ts file under `dir`, but the throwaway projects of the tests. */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '.tmp' || entry.name === 'node_modules' ? [] : sources(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

/** An import or re-export of the package, static or dynamic; not a string that mentions it. */
const IMPORTS_TERMS = /^\s*(?:import|export)\b[^;]*?from\s*['"]@fudic\/terms(?:\/[^'"]*)?['"]|\bimport\(\s*['"]@fudic\/terms/mu;

describe('the workbench never imports @fudic/terms', () => {
  it.each(['src', 'test'])('no file under %s/ imports it', (folder) => {
    // This file writes the imports it looks for, as examples of the pattern.
    const files = sources(join(PACKAGE, folder)).filter((file) => file !== fileURLToPath(import.meta.url));
    expect(files.length).toBeGreaterThan(0);
    expect(files.filter((file) => IMPORTS_TERMS.test(readFileSync(file, 'utf8')))).toEqual([]);
  });

  it('the pattern does catch an import', () => {
    expect(IMPORTS_TERMS.test("import { stock } from '@fudic/terms';")).toBe(true);
    expect(IMPORTS_TERMS.test("export type { Term } from '@fudic/terms';")).toBe(true);
    expect(IMPORTS_TERMS.test("const m = await import('@fudic/terms');")).toBe(true);
    expect(IMPORTS_TERMS.test("  \"import { defineExtension } from '@fudic/terms';\n\" +")).toBe(false);
  });

  it('does not depend on it', () => {
    const manifest = JSON.parse(readFileSync(join(PACKAGE, 'package.json'), 'utf8')) as Record<string, Record<string, string> | undefined>;
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      expect(Object.keys(manifest[field] ?? {})).not.toContain('@fudic/terms');
    }
  });

  it('context.ts is gone: the workbench builds no ctx', () => {
    expect(existsSync(join(PACKAGE, 'src', 'context.ts'))).toBe(false);
  });
});
