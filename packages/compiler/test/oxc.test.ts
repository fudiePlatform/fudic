import { describe, it, expect } from 'vitest';
import { parseSync } from 'oxc-parser';

/**
 * Confirms the native oxc-parser binary loads and parses in this environment.
 * This is the most likely install failure (unresolved NAPI binary), which is why
 * `oxc-parser` is listed in `pnpm.onlyBuiltDependencies` — see SDD-00 §3.3 / §9.
 */
describe('oxc-parser alive', () => {
  it('parses a trivial snippet without errors', () => {
    const result = parseSync('trivial.js', 'const x = 1;');

    expect(result.errors).toEqual([]);
    expect(result.program).toBeTruthy();
    expect(result.program.body.length).toBe(1);
  });
});
