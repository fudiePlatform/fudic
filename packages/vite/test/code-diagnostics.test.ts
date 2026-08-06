/**
 * BUG-13 §5.3 — the emit's diagnostics reach the plugin.
 *
 * `TransformResult.diagnostics` used to carry only the resolver's (SDD-21 layout chain). A
 * `@code` whose JavaScript does not parse produced no diagnostic at all: the module was
 * written anyway, referencing identifiers nobody declares, and the build tripped much later
 * in the prerender with a `ReferenceError` in a file that never mentioned the cause. Both
 * transforms must now hand those syntax errors to the plugin, which turns them into a build
 * error at the offending file.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { transformFud, transformFudClient } from '../src/transform.js';
import { nodeIo } from '../src/io.js';

const io = nodeIo();

/** One component on disk, whose `@code` is whatever the test needs it to be. */
function componentFile(code: string): string {
  const root = mkdtempSync(join(tmpdir(), 'fudic-bug13-'));
  const path = join(root, 'x-broken.fud');
  writeFileSync(
    path,
    `@code {\n${code}\n}\n` +
      '<x-broken>\n  <template shadowrootmode="open"><p>@(count.peek())</p></template>\n</x-broken>\n',
  );
  return path;
}

describe('a @code that does not parse stops the build in its own file', () => {
  it('carries the syntax error out of the SSR transform', () => {
    const result = transformFud(componentFile('  const = ;'), io)!;
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it('carries it out of the ?client transform too', () => {
    const result = transformFudClient(componentFile('  const = ;'), io)!;
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it('says nothing when the JS is fine — JS comments included (§7.6)', () => {
    const path = componentFile('  // c\n  /* c */\n  @client {\n    const count = signal(0);\n  }');
    expect(transformFud(path, io)!.diagnostics).toEqual([]);
    expect(transformFudClient(path, io)!.diagnostics).toEqual([]);
  });
});
