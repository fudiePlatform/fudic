/**
 * SDD-80 §3.5, §3.7, §4.7 and criteria 17, 18, 31: what the editor and `pnpm typecheck` say, in
 * one program — `$value` typed by its control, a named handler projected by its event, and the
 * datum of `@fudic:result` on the host of a component typed by the forms inside it, at any depth.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createProjectChecker, nodeFileSystem, toPosix, type CheckReport } from '../src/index.js';

function project(files: Readonly<Record<string, string>>): string {
  const root = toPosix(mkdtempSync(join(tmpdir(), 'fudic-sdd80-')));
  const tsconfig = JSON.stringify({
    compilerOptions: { target: 'ES2024', module: 'ESNext', moduleResolution: 'bundler', strict: true, skipLibCheck: true },
    include: ['src/**/*.fud'],
  });
  for (const [relative, text] of Object.entries({ 'tsconfig.json': tsconfig, ...files })) {
    const file = join(root, relative);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  return root;
}

const component = (tag: string, code: string, markup: string, uses: readonly string[] = []): string =>
  `${uses.map((u) => `<link rel="component" href="./${u}.fud">\n`).join('')}@code {\n${code}\n}\n\n<${tag}>\n  <template shadowrootmode="open">\n    ${markup}\n  </template>\n</${tag}>\n`;

/** `file code text` for each problem. */
function check(files: Readonly<Record<string, string>>): string[] {
  const root = project(files);
  const report: CheckReport = createProjectChecker({ root }).check();
  const read = nodeFileSystem().readFile;
  return report.problems.map((p) => `${p.file.slice(root.length + 1)} ${p.code} ${read(p.file)!.slice(p.span.start, p.span.end)}`);
}

const PERSON = '  type Person = { readonly id: number; readonly name: string };';

/** A component with a form whose call returns a `Person`. */
const USER_FORM = component(
  'x-user-form',
  `${PERSON}\n  async function save(): Promise<Person> { return { id: 1, name: 'a' }; }`,
  '<form form:=@save><button>ok</button></form>',
);

/** A page-less parent listening on the host of `tag`. */
const parent = (tag: string, param: string, attr = '@fudic:result=@alta'): string =>
  component('x-parent', `${PERSON}\n  function alta(${param}) { void persona; }`, `<${tag} ${attr}></${tag}>`, [tag]);

describe('@fudic:result on the host (criterion 31)', () => {
  it('the datum is what the forms inside return: a Person fits', () => {
    expect(check({ 'src/x-user-form.fud': USER_FORM, 'src/x-parent.fud': parent('x-user-form', 'persona: Person') })).toEqual([]);
  });

  it('a handler of another type is a TS error on it', () => {
    const problems = check({ 'src/x-user-form.fud': USER_FORM, 'src/x-parent.fud': parent('x-user-form', 'persona: number') });
    expect(problems).toEqual(['src/x-parent.fud TS2345 alta']);
  });

  it('two levels: a component that wraps the form registers what it returns', () => {
    const wrap = component('x-wrap', '', '<x-user-form></x-user-form>', ['x-user-form']);
    const files = { 'src/x-user-form.fud': USER_FORM, 'src/x-wrap.fud': wrap };
    expect(check({ ...files, 'src/x-parent.fud': parent('x-wrap', 'persona: Person') })).toEqual([]);
    expect(check({ ...files, 'src/x-parent.fud': parent('x-wrap', 'persona: number') })).toEqual(['src/x-parent.fud TS2345 alta']);
  });

  it('a component with no form: the handler is an error', () => {
    const plain = component('x-plain', '', '<p>hola</p>');
    expect(check({ 'src/x-plain.fud': plain, 'src/x-parent.fud': parent('x-plain', 'persona: Person') })).toEqual([
      'src/x-parent.fud TS2345 alta',
    ]);
  });

  it('the call form gets the event, with the datum in its detail', () => {
    const files = { 'src/x-user-form.fud': USER_FORM };
    const call = (param: string) =>
      component('x-parent', `${PERSON}\n  function alta(${param}) { void persona; }`, '<x-user-form @fudic:result=@alta($event.detail)></x-user-form>', ['x-user-form']);
    expect(check({ ...files, 'src/x-parent.fud': call('persona: Person') })).toEqual([]);
    expect(check({ ...files, 'src/x-parent.fud': call('persona: number') })).toEqual(['src/x-parent.fud TS2345 $event.detail']);
  });

  it('@fudic:error on the host receives an Error', () => {
    const files = { 'src/x-user-form.fud': USER_FORM };
    expect(check({ ...files, 'src/x-parent.fud': parent('x-user-form', 'persona: Error', '@fudic:error=@alta') })).toEqual([]);
  });
});

describe('$value in the editor (criteria 17, 18)', () => {
  const field = (markup: string, param: string): string =>
    component('x-field', `  function f(v: ${param}) { void v; }`, markup);

  it.each([
    ['<input type="checkbox" @change=@f($value)>', 'boolean', 'string'],
    ['<input type="number" @input=@f($value)>', 'number | null', 'number'],
    ['<input type="range" @input=@f($value)>', 'number', 'string'],
    ['<input @input=@f($value)>', 'string', 'number'],
    ['<input type="file" @change=@f($value)>', 'File[]', 'string'],
    ['<select multiple @change=@f($value)></select>', 'string[]', 'string'],
  ])('%s is a %s, and a function that wants a %s is TS2345 on $value', (markup, right, wrong) => {
    expect(check({ 'src/x-field.fud': field(markup, right) })).toEqual([]);
    expect(check({ 'src/x-field.fud': field(markup, wrong) })).toEqual(['src/x-field.fud TS2345 $value']);
  });

  it('delegated: activar gets the row and the checked of its checkbox; named handlers are typed by their event', () => {
    const table = component(
      'x-table',
      `  type Person = { readonly id: number; readonly active: boolean };\n  const personas: Person[] = [];\n` +
        '  function activar(p: Person, active: boolean) { void p; void active; }\n' +
        '  function borrar(p: Person) { void p; }\n  function ver(p: Person, e: MouseEvent) { void p; void e; }',
      '<table><tbody @change=@activar(p, $value) @click.borrar=@borrar(p) @click.ver=@ver(p, $event)>\n' +
        '      @foreach (const p of personas) key (p.id) {\n' +
        '        <tr><td><input type="checkbox" delegate:p="change"></td>' +
        '<td><button delegate:p="click.borrar">B</button></td><td><button delegate:p="click.ver">V</button></td></tr>\n' +
        '      }\n    </tbody></table>',
    );
    expect(check({ 'src/x-table.fud': table })).toEqual([]);
  });

  it('where there is no control, the FUD says it and TypeScript does not repeat it', () => {
    const problems = check({ 'src/x-field.fud': field('<div @click=@f($value)></div>', 'string') });
    expect(problems.filter((p) => p.includes(' TS'))).toEqual([]);
  });
});
