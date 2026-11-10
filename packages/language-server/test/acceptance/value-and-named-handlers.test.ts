/**
 * SDD-80 criteria 33–36 — `$value`, named handlers and the events of a form in the editor of a
 * `.fud`, asked the way an editor asks: through the whole server, every service merged.
 *
 * Its own workspace: the component written here would change what every other suite's files see.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import {
  CompletionRequest,
  HoverRequest,
  type CompletionItem,
  type CompletionList,
  type Hover,
} from 'vscode-languageserver-protocol/node';
import { copyWorkspace, startHarness, type Harness } from './_harness.js';

const TABLE = 'src/components/app-table.fud';

/** The table of SDD-80 §1: a checkbox and two buttons per row, all delegated to the `<tbody>`. */
const TEXT = `@code {
  type Person = { id: number; name: string; active: boolean };
  const { personas = [] } = props<{ personas?: Person[] }>();
  const total = 3;
  function activar(p: Person, active: boolean) { void p; void active; }
  function borrar(p: Person) { void p; }
  function ver(p: Person) { void p; }
  function f(x: unknown) { void x; }
}

<app-table>
  <template shadowrootmode="open">
    <div></div>
    <table>
      <tbody @change=@activar(p, $value) @click.borrar=@borrar(p) @click.ver=@ver(p)>
        @foreach (const p of personas) key (p.id) {
          <tr>
            <td><input type="checkbox" checked=@p.active delegate:p="change" aria-label="Activo"></td>
            <td><button delegate:p="click.borrar">Borrar</button></td>
            <td><button delegate:p="click.ver">Ver</button></td>
          </tr>
        }
      </tbody>
    </table>
    <p>@total</p>
  </template>
</app-table>
`;

let harness: Harness;
let version = 1;

beforeAll(async () => {
  const root = copyWorkspace();
  writeFileSync(`${root}/${TABLE}`, TEXT, 'utf8');
  harness = await startHarness({ root });
}, 60_000);

afterAll(async () => {
  await harness.stop();
});

/** `TEXT` with `from` replaced by `to`, where `to` holds the `|` of the cursor. */
const at = (from: string, to: string): string => {
  expect(TEXT).toContain(from);
  return TEXT.replace(from, to);
};

async function send<T>(marked: string, ask: (uri: string, position: { line: number; character: number }) => Promise<T>): Promise<T> {
  const text = marked.replace('|', '');
  const { uri } = await harness.open(TABLE);
  await harness.change(uri, text, ++version);
  return ask(uri, harness.positionAt(text, marked.indexOf('|')));
}

async function completeAt(marked: string): Promise<CompletionItem[]> {
  const answer = (await send(marked, (uri, position) =>
    harness.client.sendRequest(CompletionRequest.type, { textDocument: { uri }, position }),
  )) as CompletionList | CompletionItem[] | null;
  if (answer === null) return [];
  return Array.isArray(answer) ? answer : answer.items;
}

async function hoverAt(marked: string): Promise<string> {
  const answer = (await send(marked, (uri, position) =>
    harness.client.sendRequest(HoverRequest.type, { textDocument: { uri }, position }),
  )) as Hover | null;
  return (answer?.contents as { value: string } | undefined)?.value ?? '';
}

const dollars = (items: readonly CompletionItem[]): [string, string | undefined][] =>
  items.filter((i) => i.label.startsWith('$')).map((i) => [i.label, i.detail]);

describe('`$value` in the arguments of a handler (criterion 33)', () => {
  it('on the delegated table, `$event` and `$value` with its type', async () => {
    const items = await completeAt(at('activar(p, $value)', 'activar(p, |)'));
    expect(dollars(items)).toEqual([
      ['$event', 'Event — the event that fired'],
      ['$value', 'boolean — checked of the checkbox'],
    ]);
    // The names in scope are still there beside them.
    expect(items.map((i) => i.label)).toContain('p');
  });

  it('on a `<div>`, `$event` and no `$value`', async () => {
    expect(dollars(await completeAt(at('<div></div>', '<div @click=@f(|)></div>')))).toEqual([['$event', 'Event — the event that fired']]);
  });

  it('half written, the word keeps its `$`', async () => {
    const items = await completeAt(at('activar(p, $value)', 'activar(p, $va|)'));
    const value = items.find((i) => i.label === '$value')!;
    const edit = value.textEdit as { newText: string; range: { start: { character: number }; end: { character: number } } };
    expect(edit.newText).toBe('$value');
    expect(edit.range.end.character - edit.range.start.character).toBe('$va'.length);
  });

  it('outside the arguments, neither', async () => {
    expect(dollars(await completeAt(at('<p>@total</p>', '<p>@|</p>')))).toEqual([]);
  });
});

describe('named events in the value of a marker (criterion 34)', () => {
  it('offers `click.borrar` and `click.ver` beside `change`', async () => {
    const labels = (await completeAt(at('delegate:p="click.borrar"', 'delegate:p="|"'))).map((i) => i.label).sort();
    expect(labels).toEqual(['change', 'click.borrar', 'click.ver']);
  });

  it('replaces the whole word, its `.` included', async () => {
    const items = await completeAt(at('delegate:p="click.borrar"', 'delegate:p="click.b|"'));
    const edit = items.find((i) => i.label === 'click.borrar')!.textEdit as { range: { start: { character: number }; end: { character: number } } };
    expect(edit.range.end.character - edit.range.start.character).toBe('click.b'.length);
  });
});

describe('the handler of a named event and of a form event (criterion 35)', () => {
  const functionsOnly = (items: readonly CompletionItem[]): string[] => items.map((i) => i.label).filter((l) => l !== '@()').sort();
  const FUNCTIONS = ['@activar', '@borrar', '@f', '@ver'];

  it('after `@click.ver=@`, only the functions', async () => {
    expect(functionsOnly(await completeAt(at('@click.ver=@ver(p)', '@click.ver=@|')))).toEqual(FUNCTIONS);
  });

  it('after `@fudic:result=@`, only the functions', async () => {
    expect(functionsOnly(await completeAt(at('<div></div>', '<form @fudic:result=@|></form>')))).toEqual(FUNCTIONS);
  });

  it('after `@click.ver=` with no `@` yet, the functions with their `@`', async () => {
    expect(functionsOnly(await completeAt(at('@click.ver=@ver(p)', '@click.ver=|')))).toEqual(FUNCTIONS);
  });
});

describe('the hovers (criterion 36)', () => {
  it('over `$value`: its type and the element it is read from', async () => {
    const value = await hoverAt(at('activar(p, $value)', 'activar(p, $va|lue)'));
    expect(value).toContain('boolean');
    expect(value).toContain('checked of the checkbox');
    expect(value).toContain('`delegate:p`');
  });

  it('over `@click.borrar`: the event, the handler and the marks that read it', async () => {
    expect(await hoverAt(at('@click.borrar=', '@click.bo|rrar='))).toContain('`click`, handler `borrar`; read by 1 mark');
  });
});
