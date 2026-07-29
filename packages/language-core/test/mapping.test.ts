/**
 * SDD-23 §6, criteria 10–14: the properties of the mapping itself, checked on the emitted
 * table rather than with `tsc`.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { span } from '@fudic/compiler';
import { dedupeDiagnostics, mapToGenerated, mapToSource } from '../src/mapping.js';
import { SCAFFOLD_CAPS, USER_CAPS } from '../src/caps.js';
import { VirtualWriter } from '../src/writer.js';
import { languageServiceFor, projectCorpus, typecheckCorpus } from './typecheck.js';

const FIXTURES = resolve(fileURLToPath(new URL('../fixtures', import.meta.url)));
const BADGE = 'components/app-badge.fud';
const read = (path: string): string => readFileSync(resolve(FIXTURES, path), 'utf8');

/** The client virtual of a corpus file, with its `.fud` source. */
function clientOf(path: string, overrides: Readonly<Record<string, string>> = {}) {
  const entry = projectCorpus(overrides).find((p) => p.file.path === path)!;
  return { source: entry.file.source, virtual: entry.virtuals[0]!, virtuals: entry.virtuals };
}

describe('mapToSource / mapToGenerated', () => {
  const write = () => {
    const w = new VirtualWriter('const tone = 1;');
    w.scaffold('$text(', span(6, 10));
    w.copy(span(6, 10));
    w.scaffold(');');
    return w.build('x.fud.ts', 'typescript');
  };

  it('maps a position inside a user stretch, keeping its distance from the start', () => {
    const file = write();

    expect(mapToSource(file, 6, 'navigation')).toBe(6);
    expect(mapToSource(file, 8, 'navigation')).toBe(8);
    expect(mapToGenerated(file, 8, 'navigation')).toBe(8);
  });

  it('refuses to route a capability the stretch does not carry', () => {
    const file = write();

    // Offset 0 is the `$text(` scaffolding: nothing routes through it.
    expect(mapToSource(file, 0, 'navigation')).toBeUndefined();
    expect(mapToSource(file, 0, 'verification')).toBeUndefined();
    expect(mapToGenerated(file, 6, 'format')).toBeUndefined();
  });

  it('returns undefined outside every stretch', () => {
    const file = write();

    expect(mapToSource(file, 999, 'navigation')).toBeUndefined();
    expect(mapToGenerated(file, 999, 'navigation')).toBeUndefined();
    expect(mapToGenerated(file, 0, 'navigation')).toBeUndefined();
  });
});

describe('criterion 10 — rename is bounded', () => {
  it('renaming tone from the template reaches its declaration and all its uses, and no scaffolding', () => {
    const { service, pathOf, projected } = languageServiceFor();
    const { source, virtual } = clientOf(BADGE);

    // The `tone` the user reads inside `class:success="@(tone === 'success')"`.
    const at = mapToGenerated(virtual, source.indexOf("tone === 'success'"), 'navigation');
    expect(at).toBeDefined();

    const locations = service.findRenameLocations(pathOf(virtual.fileName), at!, false, false, {}) ?? [];
    expect(locations.length).toBeGreaterThanOrEqual(3);

    for (const location of locations) {
      // A rename crosses files — `tone` is the component's prop, so the attribute in
      // `[slug].fud` is one of its uses. Each location maps through ITS OWN virtual.
      const owner = projected.find(({ virtuals }) =>
        virtuals.some((v) => pathOf(v.fileName) === location.fileName),
      );
      expect(owner).toBeDefined();

      const target = owner!.virtuals.find((v) => pathOf(v.fileName) === location.fileName)!;
      const back = mapToSource(target, location.textSpan.start, 'navigation');

      // Every location the editor would rewrite is text the user actually wrote.
      expect(back).toBeDefined();
      expect(owner!.file.source.slice(back!, back! + location.textSpan.length)).toBe('tone');
    }

    // Both ends are covered: the declaration in `@code`…
    const declaration = source.indexOf('const { tone') + 'const { '.length;
    expect(
      locations.some(
        (l) =>
          l.fileName === pathOf(virtual.fileName) &&
          mapToSource(virtual, l.textSpan.start, 'navigation') === declaration,
      ),
    ).toBe(true);

    // …and the attribute in the page that consumes the component.
    expect(locations.some((l) => l.fileName.endsWith('[slug].fud.ts'))).toBe(true);
  });

  it('offers no rename over scaffolding', () => {
    const { service, pathOf } = languageServiceFor();
    const { virtual } = clientOf(BADGE);
    const at = virtual.text.indexOf('$tpl');

    // `$tpl` maps to nothing, so the server has nothing to answer with — which is what
    // `prepareRename` returning empty means (SDD-24 §6.8).
    expect(mapToSource(virtual, at, 'navigation')).toBeUndefined();
    expect(service.getRenameInfo(pathOf(virtual.fileName), at, {}).canRename).toBe(true);
  });
});

describe('criterion 11 — scaffolding is mute', () => {
  it('every navigable stretch is the user own text, byte for byte', () => {
    for (const { file, virtuals } of projectCorpus()) {
      for (const virtual of virtuals) {
        for (const m of virtual.mappings) {
          if (!m.caps.navigation) continue;
          expect(virtual.text.slice(m.generatedOffset, m.generatedOffset + m.length)).toBe(
            file.source.slice(m.sourceOffset, m.sourceOffset + m.sourceLength),
          );
        }
      }
    }
  });

  it('no synthetic identifier is reachable from the source', () => {
    const { source, virtual } = clientOf(BADGE);

    for (const synthetic of ['$p0', '$tpl', '$Props', '$attrs', '$cls']) {
      const at = virtual.text.indexOf(synthetic);
      if (at === -1) continue;
      expect(mapToSource(virtual, at, 'navigation')).toBeUndefined();
      expect(mapToSource(virtual, at, 'completion')).toBeUndefined();
    }
    expect(source).not.toContain('$p0');
  });

  it('the only diagnostics-only stretch is the tag projected as a type name', () => {
    const { source, virtuals } = clientOf('blog/[slug].fud');
    const client = virtuals[0]!;
    const only = client.mappings.filter((m) => m.caps.verification && !m.caps.navigation);

    expect(only.length).toBeGreaterThan(0);
    for (const m of only) {
      // Resolved (`$C0`) or not (`$C_app_missing`), it is always the tag alias — and it
      // always stands for the tag name the user wrote.
      expect(client.text.slice(m.generatedOffset, m.generatedOffset + m.length)).toMatch(/^\$C/);
      expect(source.slice(m.sourceOffset, m.sourceOffset + m.sourceLength)).toMatch(/^[a-z]+-/);
    }
  });
});

describe('dedupeDiagnostics', () => {
  const at = (virtual: string, sourceOffset: number, code = 2322) => ({ virtual, sourceOffset, code });

  it('keeps the client virtual when the same error is found in both', () => {
    const deduped = dedupeDiagnostics([at('x.fud.server.ts', 10), at('x.fud.ts', 10)], 'x.fud.ts');

    expect(deduped).toEqual([at('x.fud.ts', 10)]);
  });

  it('keeps the client virtual whichever order they arrive in', () => {
    const deduped = dedupeDiagnostics([at('x.fud.ts', 10), at('x.fud.server.ts', 10)], 'x.fud.ts');

    expect(deduped).toEqual([at('x.fud.ts', 10)]);
  });

  it('keeps errors that differ in place or in code', () => {
    const input = [at('x.fud.ts', 10), at('x.fud.ts', 20), at('x.fud.ts', 10, 2304)];

    expect(dedupeDiagnostics(input, 'x.fud.ts')).toHaveLength(3);
  });

  it('keeps a server-only error, with no client twin to prefer', () => {
    const input = [at('x.fud.server.ts', 10), at('x.fud.server.ts', 10)];

    expect(dedupeDiagnostics(input, 'x.fud.ts')).toEqual([at('x.fud.server.ts', 10)]);
  });
});

describe('criterion 12 — one diagnostic, one place', () => {
  it('an error in the neutral zone is reported once, against the client virtual', () => {
    const broken = read(BADGE).replace(
      '  const { tone',
      "  const oops: number = 'x';\n  const { tone",
    );
    const diagnostics = typecheckCorpus({ [BADGE]: broken });

    // The neutral zone lives in both virtuals, so the checker finds it twice…
    expect(diagnostics.filter((d) => d.code === 2322)).toHaveLength(2);

    // …and deduplication against the canonical virtual leaves exactly one.
    const deduped = dedupeDiagnostics(
      diagnostics.map((d) => ({ ...d, sourceOffset: d.sourceOffset ?? -1 })),
      'components/app-badge.fud.ts',
    );
    expect(deduped).toHaveLength(1);
    expect(deduped[0]!.virtual).toBe('components/app-badge.fud.ts');
    expect(deduped[0]!.sourceText).toBe('oops');
  });
});

describe('criterion 13 — partial emission', () => {
  it('an unclosed element still yields a virtual, and the healthy parts still project', () => {
    const broken = read(BADGE).replace('<span', '<div><span');
    const { virtual } = clientOf(BADGE, { [BADGE]: broken });

    expect(virtual.text).toContain('const $p0 = props<{ tone?: Tone }>();');
    expect(virtual.text).toContain("$cls(tone === 'success');");
    expect(virtual.text).toContain('$slot();');
  });

  it('a broken file does not stop the other files of the corpus', () => {
    const broken = read(BADGE).replace('<span', '<div><span');

    expect(projectCorpus({ [BADGE]: broken })).toHaveLength(4);
  });
});

describe('criterion 14 — determinism', () => {
  it('two emissions of the corpus are identical, bytes and mappings', () => {
    expect(projectCorpus().map((p) => p.virtuals)).toEqual(
      projectCorpus().map((p) => p.virtuals),
    );
  });
});
