/**
 * SDD-86 (framework fix, 2330e0f4) — a view that reads an imported store repaints at hookup when
 * the store was written before it hydrated: another component may have written it, and the
 * markup this one adopts still says what the server painted.
 *
 * The hookup asks once, in one condition: `$written` for the signals the file declares,
 * `$writtenIf` for the names it imports (whose shape the emit cannot know).
 */
import { describe, expect, it } from 'vitest';
import { resolveComponents, emitComponentClientModule } from '../../src/emit/index.js';
import { memoryIo } from './_support.js';

function chunk(code: string, markup: string): string {
  const g = resolveComponents(
    '/p.fud',
    memoryIo({
      '/p.fud': '<link rel="component" href="./c.fud">\n<html><head></head><body><x-c></x-c></body></html>\n',
      '/c.fud': `@code {\n${code}\n}\n<x-c>\n  <template shadowrootmode="open">${markup}</template>\n</x-c>\n`,
    }),
  );
  return emitComponentClientModule(g, g.components.get('x-c')!);
}

describe('the hookup of a view that reads a store', () => {
  it('an imported store read by the view: $writtenIf, imported once', () => {
    const code = chunk("import { count } from './store';", '<p>@count()</p>');
    expect(code).toMatch(/import \{[^}]*writtenIf as \$writtenIf[^}]*\} from '@fudic\/core';/u);
    expect(code).toMatch(/if \(\$writtenIf\(count\)\) \$u\(\);/u);
  });

  it('a signal of its own and a store: one condition, both asked', () => {
    const code = chunk(
      "import { signal } from '@fudic/core';\nimport { count } from './store';\nconst n = signal(0);",
      '<p>@n() @count()</p>',
    );
    expect(code).toMatch(/if \(\$written\(n\) \|\| \$writtenIf\(count\)\) \$u\(\);/u);
  });

  it('no import read by the view: no $writtenIf at all', () => {
    const code = chunk("import { signal } from '@fudic/core';\nconst n = signal(0);", '<p>@n()</p>');
    expect(code).not.toContain('writtenIf');
    expect(code).toMatch(/if \(\$written\(n\)\) \$u\(\);/u);
  });
});
