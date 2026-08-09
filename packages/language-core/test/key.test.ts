/**
 * BUG-17 §6.5–§6.9 — the key of a loop, measured against the real TypeScript service.
 *
 * The emitted text is not the measurement. `template.test.ts` already asserts that `$key(…)`
 * is written and that the expression travels copied; what those assertions cannot say is
 * whether an editor gets an answer at those offsets — and BUG-16 is the reminder that a
 * projection can look perfect in the virtual and offer nothing in the editor. So everything
 * here goes through `getCompletionsAtPosition`, `getDefinitionAtPosition` and
 * `findRenameLocations`, over the corpus, the way the server drives them.
 *
 * The fixture is `components/app-list.fud`: a keyed `@foreach` with another keyed `@foreach`
 * inside it, which is what makes the nesting criterion a fact of the corpus rather than of
 * one test's string.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapToGenerated, mapToSource } from '../src/mapping.js';
import type { VirtualFile } from '../src/types.js';
import { languageServiceFor, projectCorpus, typecheckCorpus } from './typecheck.js';

const FIXTURES = resolve(fileURLToPath(new URL('../fixtures', import.meta.url)));
const LIST = 'components/app-list.fud';

const base = (): string => readFileSync(resolve(FIXTURES, LIST), 'utf8');

/** The fixture with one stretch rewritten, plus its projection. */
function withKey(from: string, to: string): { source: string; virtual: VirtualFile } {
  const original = base();
  if (!original.includes(from)) throw new Error(`anchor not found: ${from}`);
  const source = original.replace(from, to);
  const entry = projectCorpus({ [LIST]: source }).find((p) => p.file.path === LIST)!;
  return { source, virtual: entry.virtuals[0]! };
}

/** What an editor would be offered at `offset` of the `.fud`, through the projection. */
function completionsAt(source: string, virtual: VirtualFile, offset: number): readonly string[] {
  const { service, pathOf } = languageServiceFor({ [LIST]: source });
  const at = mapToGenerated(virtual, offset, 'completion');
  expect(at, 'the position maps into the projection').toBeDefined();

  const info = service.getCompletionsAtPosition(pathOf(virtual.fileName), at!, undefined);
  return (info?.entries ?? []).map((e) => e.name);
}

describe('the list inside key (…) is the one TypeScript knows (§6.5)', () => {
  it('`key (item.|)` offers the properties of the element, with its real type', () => {
    const { source, virtual } = withKey('key (group.id + item.id)', 'key (item.)');
    const names = completionsAt(source, virtual, source.indexOf('key (item.') + 'key (item.'.length);

    // `Row`, reached through `Group['rows']` — a type nobody wrote at this position.
    expect(names).toEqual(expect.arrayContaining(['id', 'label']));
  });

  it('`key (|)` offers what the header declares, with the parentheses still empty', () => {
    // The empty clause is why the parser keeps it (§3.5): this is the first thing on screen.
    const { source, virtual } = withKey('key (group.id + item.id)', 'key ()');
    const names = completionsAt(source, virtual, source.indexOf('key ()') + 'key ('.length);

    expect(names).toContain('item');
  });

  it('sees BOTH loops from the key of the inner one (§6.9)', () => {
    const { source, virtual } = withKey('key (group.id + item.id)', 'key ()');
    const names = completionsAt(source, virtual, source.indexOf('key ()') + 'key ('.length);

    expect(names).toEqual(expect.arrayContaining(['group', 'item']));
  });
});

describe('the completion replaces what is written, and no more (§6.6)', () => {
  it('`key (item.i|)` replaces `i`, not the dot and not the name before it', () => {
    const { source, virtual } = withKey('key (group.id + item.id)', 'key (item.i)');
    const { service, pathOf } = languageServiceFor({ [LIST]: source });
    const caret = source.indexOf('key (item.i') + 'key (item.i'.length;
    const at = mapToGenerated(virtual, caret, 'completion')!;

    const info = service.getCompletionsAtPosition(pathOf(virtual.fileName), at, undefined);
    const label = info?.entries.find((e) => e.name === 'label');
    expect(label).toBeDefined();

    const span = label!.replacementSpan ?? info!.optionalReplacementSpan;
    expect(span).toBeDefined();
    expect(virtual.text.slice(span!.start, span!.start + span!.length)).toBe('i');

    // And it comes back: what the editor edits is the source, so a range is only right when
    // both ends map home. A range that does not is how accepting an item writes rubbish.
    const from = mapToSource(virtual, span!.start, 'completion');
    const to = mapToSource(virtual, span!.start + span!.length, 'completion');
    expect(source.slice(from!, to!)).toBe('i');
  });
});

describe('a key that names something that is not there (§6.7)', () => {
  it('reports TS2339 on the characters the author wrote, in `.fud` coordinates', () => {
    const source = base().replace('key (group.id + item.id)', 'key (item.nope)');
    const diags = typecheckCorpus({ [LIST]: source });

    expect(diags).toHaveLength(1);
    expect(diags[0]!.code).toBe(2339);
    expect(diags[0]!.fud).toBe(LIST);
    expect(diags[0]!.sourceText).toBe('nope');
  });

  it('says nothing about a key that is merely unfinished', () => {
    // `key ()` is `FUD0541`, which is the compiler's to report. The projection stands in for
    // the empty expression under completion only, so no TypeScript error lands on it.
    const diags = typecheckCorpus({ [LIST]: base().replace('key (group.id + item.id)', 'key ()') });

    expect(diags).toEqual([]);
  });
});

describe('navigation and rename reach through the key (§6.8)', () => {
  it('F12 on a name inside the key lands on the header that declares it', () => {
    const source = base();
    const entry = projectCorpus({ [LIST]: source }).find((p) => p.file.path === LIST)!;
    const virtual = entry.virtuals[0]!;
    const { service, pathOf } = languageServiceFor({ [LIST]: source });

    const inKey = source.indexOf('+ item.id') + '+ '.length;
    const at = mapToGenerated(virtual, inKey, 'navigation');
    expect(at).toBeDefined();
    const definitions = service.getDefinitionAtPosition(pathOf(virtual.fileName), at!) ?? [];
    expect(definitions).toHaveLength(1);

    const home = mapToSource(virtual, definitions[0]!.textSpan.start, 'navigation');
    expect(home).toBeDefined();
    // The `item` of `@foreach (const item of group.rows)`, and not the one in the key.
    expect(source.slice(home!, home! + 4)).toBe('item');
    expect(home).toBe(source.indexOf('const item of group.rows') + 'const '.length);
  });

  it('renaming the iteration variable in the header rewrites it inside the key too', () => {
    const source = base();
    const entry = projectCorpus({ [LIST]: source }).find((p) => p.file.path === LIST)!;
    const virtual = entry.virtuals[0]!;
    const { service, pathOf } = languageServiceFor({ [LIST]: source });

    const declared = source.indexOf('const item of group.rows') + 'const '.length;
    const at = mapToGenerated(virtual, declared, 'navigation')!;
    const locations = service.findRenameLocations(pathOf(virtual.fileName), at, false, false, {}) ?? [];

    const inSource = locations
      .map((l) => mapToSource(virtual, l.textSpan.start, 'navigation'))
      .filter((o): o is number => o !== undefined);

    expect(inSource).toContain(declared);
    expect(inSource).toContain(source.indexOf('+ item.id') + '+ '.length);
    // And nothing invented: every location the editor is handed is a real offset of the file.
    expect(inSource).toHaveLength(locations.length);
  });
});
