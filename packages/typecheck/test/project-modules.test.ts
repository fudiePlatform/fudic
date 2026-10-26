/**
 * SDD-61 §4.1 — the host reads the modules of the project the server cut follows: the index
 * resolves a relative specifier as TypeScript does and hands back the same object while the
 * text is the same; the semantic input carries it with the file's path; and the check reports a
 * diagnostic of a store on the store, once.
 */

import { describe, expect, it } from 'vitest';
import { analyze, span, type Diagnostic } from '@fudic/compiler';
import { describeFud, FudIndex } from '../src/fud-index.js';
import { semanticInput } from '../src/fudic-diagnostics.js';
import { fudicProblems } from '../src/checker.js';
import { projectFud } from '../src/project.js';
import { memoryFs } from './_support.js';

const STORE = '/p/src/store/contador.ts';
const PAGE = '/p/src/routes/page.fud';

function indexOver(files: Record<string, string>): FudIndex {
  const index = new FudIndex(memoryFs(files), describeFud);
  index.scan('/p');
  return index;
}

describe('FudIndex.module', () => {
  const files = {
    [STORE]: 'export const count = 1;',
    '/p/src/store/index.ts': 'export * from "./contador.ts";',
    '/elsewhere/x.ts': 'export const x = 1;',
  };

  it('resolves a specifier with its extension, with .js, with none, or naming a folder', () => {
    const index = indexOver(files);
    expect(index.module(PAGE, '../store/contador.ts')?.path).toBe(STORE);
    expect(index.module(PAGE, '../store/contador.js')?.path).toBe(STORE);
    expect(index.module(PAGE, '../store/contador')?.path).toBe(STORE);
    expect(index.module(PAGE, '../store')?.path).toBe('/p/src/store/index.ts');
  });

  it('answers nothing for a package, a file outside the project, or one that is not there', () => {
    const index = indexOver(files);
    expect(index.module(PAGE, '@fudic/core')).toBeUndefined();
    expect(index.module(PAGE, '../../../elsewhere/x.ts')).toBeUndefined();
    expect(index.module(PAGE, '../store/nada.ts')).toBeUndefined();
  });

  it('hands back the same object while the text is the same, and a new one when it changes', () => {
    const disk: Record<string, string> = { ...files };
    const index = indexOver(disk);
    const first = index.module(PAGE, '../store/contador.ts');
    expect(index.module(PAGE, '../store/contador')).toBe(first);
    disk[STORE] = 'export const count = 2;';
    const second = index.module(PAGE, '../store/contador.ts');
    expect(second).not.toBe(first);
    expect(second?.source).toBe('export const count = 2;');
  });

  it('reads a file for the editor to show a diagnostic over', () => {
    const index = indexOver(files);
    expect(index.read(STORE)).toBe('export const count = 1;');
    expect(index.read('/p/nada.ts')).toBeUndefined();
  });
});

describe('semanticInput', () => {
  const page = `@code {\n  import { count } from '../store/contador.ts';\n}\n<x-a><template shadowrootmode="open"><p>@count()</p></template></x-a>`;
  const store = `import { signal } from '@fudic/core';\nexport const count = signal(Math.random());`;

  it('carries the path and the reader of the index, and the server cut follows it', () => {
    const index = indexOver({ [PAGE]: page, [STORE]: store });
    const input = semanticInput(projectFud({ path: PAGE, source: page, index }), index);
    expect(input.path).toBe(PAGE);
    expect(input.readModule?.('../store/contador.ts', PAGE)?.path).toBe(STORE);
    const found = analyze({ ...input }).diagnostics.filter((d) => d.code === 'FUD0907');
    expect(found.map((d) => [d.file, store.slice(d.span.start, d.span.end), d.related?.[0]?.file])).toEqual([
      [STORE, 'Math', PAGE],
    ]);
  });

  it('without an index that reads modules, the project is not followed', () => {
    const index = indexOver({ [PAGE]: page });
    const document = projectFud({ path: PAGE, source: page, index });
    expect(semanticInput(document).readModule).toBeUndefined();
    expect(semanticInput(document, { resolve: () => undefined, failure: () => undefined }).readModule).toBeUndefined();
  });
});

describe('fudicProblems', () => {
  const error = (file?: string): Diagnostic => ({
    severity: 'error',
    code: 'FUD1150',
    message: 'm',
    span: span(1, 2),
    ...(file === undefined ? {} : { file }),
  });

  it('reports a diagnostic of a store on the store, once, read by every .fud that reaches it', () => {
    const elsewhere = new Map<string, string[]>();
    const first = fudicProblems(PAGE, [error(), error(PAGE), error(STORE)], elsewhere);
    expect(first.map((p) => [p.file, p.readBy])).toEqual([
      [PAGE, undefined],
      [PAGE, undefined],
      [STORE, [PAGE]],
    ]);
    const other = '/p/src/routes/otra.fud';
    expect(fudicProblems(other, [error(STORE)], elsewhere)).toEqual([]);
    expect(first[2]?.readBy).toEqual([PAGE, other]);
  });

  it('leaves out what is neither an error nor a warning', () => {
    expect(fudicProblems(PAGE, [{ ...error(), severity: 'info' }], new Map())).toEqual([]);
  });
});
