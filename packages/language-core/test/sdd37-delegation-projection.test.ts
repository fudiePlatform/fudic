/**
 * `$name` in the editor (SDD-37 §4.5, §6.18).
 *
 * `$day` is written in an ANCESTOR's handler and declared by a loop below it, so there is no
 * scope in the projection that holds it. The loop's own header re-opens the exact one, which
 * is what makes `$day` the element of `days` — and, with a destructured header, the type of
 * the member and not of the row.
 *
 * The text assertions say what is projected; the corpus run says TypeScript agrees.
 */

import { describe, expect, it } from 'vitest';
import { emitVirtualFiles } from '../src/emit.js';
import { clientFileName } from '../src/paths.js';
import type { VirtualFile } from '../src/types.js';
import { parseFud, registryOf } from './_support.js';
import { typecheckCorpus, type CorpusDiagnostic } from './typecheck.js';

/**
 * The client virtual, through the ORCHESTRATOR and not through `emitClientVirtual`.
 *
 * The difference is the batch: delegation is answered from the AST of the loop headers, and
 * only `emit.ts` registers them. A projector handed no batch sees no marker at all, which is
 * the same «say nothing new» every other AST-dependent rule degrades to.
 */
function project(source: string): VirtualFile {
  const files = emitVirtualFiles({
    source,
    fileName: 'x.fud',
    document: parseFud(source),
    registry: registryOf({}),
  });
  return files.find((f) => f.fileName === clientFileName('x.fud'))!;
}

const describeDiag = (d: CorpusDiagnostic): string =>
  `${d.fud} ${d.code} ${d.message} @${d.sourceText ?? '<unmapped>'}`;

/** A component whose grid delegates one name to one handler. */
const CALENDAR = (header: string, marker: string, args: string): string =>
  '@code {\n' +
  '  type Day = { id: string; n: number };\n' +
  '  const { days } = props<{ days: Day[] }>();\n' +
  '  @client {\n' +
  '    function pick(ev, day) { void ev; void day; }\n' +
  '  }\n}\n' +
  '<app-cal>\n  <template shadowrootmode="open">\n' +
  `    <div @click="@pick(${args})">\n` +
  `      @foreach (${header}) key (day.id) {\n` +
  `        <b ${marker}>x</b>\n` +
  '      }\n' +
  '    </div>\n' +
  '  </template>\n</app-cal>\n';

describe('the scope a `$name` is read in (§4.5)', () => {
  it('re-opens the loop header around the handler, and binds the name to it', () => {
    const { text } = project(CALENDAR('const day of days', 'delegate:day', '$event, $day'));

    expect(text).toContain(
      '$on(\'click\', ($event) => { for (const day of days) { const $day = day; return pick($event, $day); } })',
    );
  });

  it('binds the MEMBER of a destructured header, not the row', () => {
    const { text } = project(
      CALENDAR('const { id, n } of days', 'delegate:n', '$event, $n').replace(
        'key (day.id)',
        'key (id)',
      ),
    );

    expect(text).toContain('for (const { id, n } of days) { const $n = n; return pick($event, $n); }');
  });

  it('nests two headers for two names, outermost first', () => {
    const source =
      '@code {\n' +
      '  type Tag = { id: string };\n' +
      '  type Row = { id: string; tags: Tag[] };\n' +
      '  const { rows } = props<{ rows: Row[] }>();\n' +
      '  @client {\n' +
      '    function pick(row, tag) { void row; void tag; }\n' +
      '  }\n}\n' +
      '<app-cal>\n  <template shadowrootmode="open">\n' +
      '    <div @click="@pick($row, $tag)">\n' +
      '      @foreach (const row of rows) key (row.id) {\n' +
      '        @foreach (const tag of row.tags) key (tag.id) {\n' +
      '          <b delegate:row delegate:tag>x</b>\n' +
      '        }\n' +
      '      }\n' +
      '    </div>\n' +
      '  </template>\n</app-cal>\n';

    const { text } = project(source);
    // The outer header first: the inner one reads `row`, so any other order is a TS2304.
    expect(text).toContain(
      'for (const row of rows) { for (const tag of row.tags) { const $row = row; const $tag = tag; ' +
        'return pick($row, $tag); } }',
    );
  });

  it('re-opens a C-style `@for` header too, whose binding is its index', () => {
    const source =
      '@code {\n' +
      '  const { n } = props<{ n: number }>();\n' +
      '  @client {\n    function pick(i) { void i; }\n  }\n}\n' +
      '<app-cal>\n  <template shadowrootmode="open">\n' +
      '    <div @click="@pick($i)">\n' +
      '      @for (let i = 0; i < n; i++) key (i) {\n' +
      '        <b delegate:i>x</b>\n' +
      '      }\n' +
      '    </div>\n  </template>\n</app-cal>\n';

    expect(project(source).text).toContain(
      'for (let i = 0; i < n; i++) { const $i = i; return pick($i); }',
    );
  });

  it('registers no header for what declares nothing, and does not trip over it', () => {
    // An `@if` opens no scope a name could come from, and a `@foreach ()` mid-keystroke has
    // an empty header — `FUD0070` — which would make the whole batch unparseable. Both are
    // skipped, and the file around them keeps projecting.
    const { text } = project(
      '<app-x>\n  <template shadowrootmode="open">\n' +
        '    @if (ready) { <p>a</p> }\n' +
        '    @foreach () { <p>b</p> }\n' +
        '  </template>\n</app-x>\n',
    );

    expect(text).toContain('if (ready) {');
    expect(text).toContain('for (const $item of []) {');
  });

  it('leaves a handler with no `$name` byte for byte as it was', () => {
    const { text } = project(CALENDAR('const day of days', 'delegate:day', '$event, day'));

    expect(text).toContain("$on('click', ($event) => pick($event, day));");
    expect(text).not.toContain('const $day');
  });

  it('copies the header as SCAFFOLDING: `days` is mapped once, where it is written', () => {
    const source = CALENDAR('const day of days', 'delegate:day', '$event, $day');
    const { text, mappings } = project(source);

    // Twice in the generated text — the real loop and the synthetic scope — and exactly one
    // of the two is a stretch that routes back to the source. A second one would make a
    // hover on `days` answerable from two places, which is a mapping bug, not a feature.
    expect(text.split('const day of days')).toHaveLength(3);
    const at = source.indexOf('const day of days');
    const mapped = mappings.filter((m) => m.sourceOffset <= at && at < m.sourceOffset + m.length);
    expect(mapped).toHaveLength(1);
  });
});

describe('and TypeScript agrees (§6.18)', () => {
  const CORPUS = 'components/app-list.fud';

  /** The corpus list, with the inner loop delegating its row to a handler on the outer `<ul>`. */
  const delegated = (call: string): Record<string, string> => ({
    [CORPUS]:
      '@code {\n' +
      '  type Row = { id: string; label: string };\n' +
      '  type Group = { id: string; rows: Row[] };\n\n' +
      '  const { groups } = props<{ groups: Group[] }>();\n\n' +
      '  @client {\n' +
      '    function pick(ev: Event, row: Row) { void ev; void row.label; }\n' +
      '  }\n' +
      '}\n\n' +
      '<app-list>\n  <template shadowrootmode="open">\n' +
      `    <ul @click="@pick(${call})">\n` +
      '      @foreach (const group of groups) key (group.id) {\n' +
      '        <li>\n' +
      '          <ol>\n' +
      '            @foreach (const item of group.rows) key (group.id + item.id) {\n' +
      '              <li delegate:item>@item.label</li>\n' +
      '            }\n' +
      '          </ol>\n' +
      '        </li>\n' +
      '      }\n' +
      '    </ul>\n' +
      '  </template>\n</app-list>\n',
  });

  it('types `$item` as the row: a correct handler typechecks clean', () => {
    expect(typecheckCorpus(delegated('$event, $item')).map(describeDiag)).toEqual([]);
  });

  it('and a handler that expects something else is an error ON the `$name`', () => {
    // `pick` takes `(Event, Row)`. Handing it `($item, $item)` puts a `Row` where an `Event`
    // goes — which only has an answer at all because `$item` carries the row's type.
    const diags = typecheckCorpus(delegated('$item, $item'));

    expect(diags).toHaveLength(1);
    expect(diags[0]!.code).toBe(2345);
    expect(diags[0]!.sourceText).toBe('$item');
    expect(diags[0]!.message).toContain('Row');
  });
});
