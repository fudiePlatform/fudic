/**
 * SDD-75 §4.2 — the index of who implements what, and the lenses it gives: every way a script can
 * name a piece, and every place a script can be.
 */

import { describe, expect, it } from 'vitest';
import { ImplementationIndex, implementationsIn } from '../../src/fudapi/implementations.js';
import { implementationLenses, typeLenses } from '../../src/fudapi/lenses.js';
import { APP, FILES, SRC, apiDocument, apiFs, world } from './_api.js';

const found = (text: string, file = 'a.ts') => implementationsIn(file, text).map((i) => `${i.id}:${i.name}.${i.method}`);

describe('implementationsIn', () => {
  it('a call on a name imported from `fudic:`, under any local name', () => {
    expect(found("import { save as guardar } from 'fudic:routes/u';\nguardar.handle(() => {});")).toEqual(['routes/u:save.handle']);
    expect(found("import { 'save' as s } from 'fudic:routes/u';\ns.handle(() => {});")).toEqual(['routes/u:save.handle']);
  });

  it('the five methods, nested anywhere in the module, and plain JavaScript too', () => {
    const text = "import { a, b, c, d, e } from 'fudic:x';\nexport function f() { a.handle(); if (1) { b.check(); } }\nc.client();\nd.server();\nexport default e.implement((v) => v);";
    expect(found(text)).toEqual(['x:a.handle', 'x:b.check', 'x:c.client', 'x:d.server', 'x:e.implement']);
    expect(found("import { a } from 'fudic:x';\na.handle(() => 1);", 'a.js')).toEqual(['x:a.handle']);
  });

  it('nothing else: other modules, other imports, other calls', () => {
    const text = [
      "import def, * as all from 'fudic:x';",
      "import { a } from 'fudic:x';",
      "import { other } from './other';",
      'def.handle(); all.handle(); other.handle();',
      "a['handle'](); a.other(); a.b.handle(); handle(); this.a.handle();",
      'class K { #p = () => 1; m() { return a.#p(); } }',
    ].join('\n');
    expect(found(text)).toEqual([]);
  });

  it('a script that does not parse, nothing', () => {
    expect(found("import { a } from 'fudic:x';\na.handle(")).toEqual([]);
  });

  it('the range is the method, where a click lands', () => {
    const [one] = implementationsIn('a.ts', "import { a } from 'fudic:x';\n  a.handle();");
    expect(one!.range).toEqual({ start: { line: 1, character: 4 }, end: { line: 1, character: 10 } });
    expect(one!.file).toBe('a.ts');
  });
});

describe('ImplementationIndex', () => {
  const HANDLES = "import { save } from 'fudic:routes/u';\nsave.handle();";
  const FOLDERS = [`${SRC}/server`, `${SRC}/browser`];

  it("under its folders, at any depth, scripts only, by the file's <id>", () => {
    const fs = apiFs({
      [`${SRC}/server/a.ts`]: HANDLES,
      [`${SRC}/server/deep/b.mts`]: HANDLES,
      [`${SRC}/browser/c.js`]: HANDLES,
      [`${SRC}/server/types.d.ts`]: HANDLES,
      // Listed, but gone before it is read: nothing.
      [`${SRC}/server/gone.ts`]: undefined,
      [`${SRC}/server/notes.md`]: HANDLES,
      [`${SRC}/server/node_modules/x/d.ts`]: HANDLES,
      [`${SRC}/server/.cache/e.ts`]: HANDLES,
      [`${SRC}/routes/f.ts`]: HANDLES,
      [`${SRC}/server/other.ts`]: "import { save } from 'fudic:routes/other';\nsave.handle();",
    });
    const files = new ImplementationIndex(fs).of(FOLDERS, 'routes/u').map((i) => i.file);
    expect(files).toEqual([`${SRC}/server/a.ts`, `${SRC}/server/deep/b.mts`, `${SRC}/browser/c.js`]);
  });

  it('reads a script once, and again after it changed; a new one after any change', () => {
    const files: Record<string, string | undefined> = { [`${SRC}/server/a.ts`]: HANDLES };
    const fs = apiFs(files);
    const index = new ImplementationIndex(fs);
    const of = () => index.of(FOLDERS, 'routes/u').map((i) => i.file);
    expect(of()).toEqual([`${SRC}/server/a.ts`]);
    expect(of()).toEqual([`${SRC}/server/a.ts`]);
    expect(fs.reads.filter((r) => r.endsWith('a.ts'))).toHaveLength(1);

    files[`${SRC}/server/b.ts`] = HANDLES;
    files[`${SRC}/server/a.ts`] = 'export {};';
    index.invalidate(`${SRC}/server/a.ts`);
    expect(of()).toEqual([`${SRC}/server/b.ts`]);
    // A script deleted under the index reads as an empty one.
    delete files[`${SRC}/server/b.ts`];
    index.invalidate(`${SRC}/server/b.ts`);
    expect(of()).toEqual([]);
  });

  it('only scripts move it', () => {
    expect(ImplementationIndex.affects(`${SRC}/server/a.ts`)).toBe(true);
    expect(ImplementationIndex.affects(`${SRC}/browser/a.js`)).toBe(true);
    expect(ImplementationIndex.affects(`${SRC}/routes/a.fud`)).toBe(false);
  });
});

describe('where a contract is implemented, by the host', () => {
  const LIB = '/ws/forms';
  const RULE = 'rule required\n  on field *\n  runs both\n  fails required\n';

  it('an app: its src/server, src/browser and its folder of pipes, by its fudic.json', () => {
    const { host } = world();
    expect(host.implementationFolders(`${SRC}/routes/u.fudapi`)).toEqual([`${SRC}/server`, `${SRC}/browser`, `${SRC}/pipes`]);
    const custom = world({ files: { ...FILES, [`${APP}/fudic.json`]: JSON.stringify({ pipes: 'src/formats' }) } }).host;
    expect(custom.implementationFolders(`${SRC}/routes/u.fudapi`)[2]).toBe(`${SRC}/formats`);
  });

  it("a library's own contract: its server/ and browser/, its <id> and its types by its package name", () => {
    const path = `${LIB}/fudapi/rules.fudapi`;
    const files = {
      [`${LIB}/package.json`]: JSON.stringify({ name: '@fudic/forms' }),
      [path]: RULE,
      [`${LIB}/browser/rules.js`]: "import { required } from 'fudic:@fudic/forms/rules';\nrequired.check(() => true);",
    };
    const { host, implementations } = world({ files, roots: ['/ws'] });
    const doc = apiDocument(host, RULE, path);
    expect(doc.source.id).toBe('@fudic/forms/rules');
    expect(host.implementationFolders(path)).toEqual([`${LIB}/server`, `${LIB}/browser`, `${LIB}/src/pipes`]);
    const found = implementations.of(host.implementationFolders(path), doc.source.id);
    expect(found.map((i) => `${i.file}:${i.name}`)).toEqual([`${LIB}/browser/rules.js:required`]);
    // Its types, where an app keeps a library's: under its package name.
    const types = `${LIB}/.fudic/api/@fudic/forms/rules.d.ts`;
    expect(host.typesOf(path)).toBe(types);
    expect(host.written(types)).toContain('required');
  });

  it('a library whose package.json names nothing has no contracts of its own', () => {
    for (const pkg of [JSON.stringify({}), '{']) {
      const { host } = world({ files: { [`${LIB}/package.json`]: pkg, [`${LIB}/fudapi/rules.fudapi`]: RULE }, roots: ['/ws'] });
      expect(apiDocument(host, RULE, `${LIB}/fudapi/rules.fudapi`).source.id).toBe('rules');
    }
  });
});

describe('typeLenses', () => {
  const PATH = `${SRC}/routes/blog.fudapi`;
  const TEXT = 'type Person\n  name  str\nenum Role\n  a\npattern email "x"\nget find\n  id  i32\n';

  it('over each type, enum, form and pattern, what it generates, and a click to it in the types', () => {
    const { host } = world({ files: { ...FILES, [PATH]: TEXT } });
    const doc = apiDocument(host, TEXT, PATH);
    const types = host.typesText(PATH);
    const lenses = typeLenses(doc, types);
    expect(lenses.map((l) => [l.range.start.line, l.command!.title])).toEqual([
      [0, 'interface Person'],
      [2, 'type Role'],
      [4, 'const email'],
    ]);
    const [file, range] = lenses[0]!.command!.arguments as [string, { start: { line: number; character: number } }];
    expect(file).toBe(types.path);
    expect(types.text.split('\n')[range.start.line]!.slice(range.start.character)).toMatch(/^interface Person\b/u);
  });

  it('a form, in its own file, by the name it is exported with', () => {
    const path = `${SRC}/forms/person.fudapi`;
    const text = 'form personForm\n  a  str\n';
    const { host } = world({ files: { ...FILES, [path]: text } });
    expect(typeLenses(apiDocument(host, text, path), host.typesText(path)).map((l) => l.command!.title)).toEqual(['const personForm']);
  });

  it('nothing over a declaration the types do not have, as on a disk that refuses them', () => {
    const { host, fs } = world({ files: { ...FILES, [PATH]: TEXT } });
    fs.writeFile = () => undefined;
    const types = host.typesText(PATH);
    expect(types.text).toBe('');
    expect(typeLenses(apiDocument(host, TEXT, PATH), types)).toEqual([]);
  });
});

describe('implementationLenses', () => {
  const lensesOf = (text: string, scripts: Readonly<Record<string, string>>): readonly string[] => {
    const { host, implementations } = world({ files: { ...FILES, ...scripts } });
    const doc = apiDocument(host, text, `${SRC}/routes/blog.fudapi`);
    return implementationLenses(doc, APP, implementations.of(host.implementationFolders(doc.path), doc.source.id)).map((l) => l.command!.title);
  };

  it('`load`, `paths`, `layout`, a function, a rule and a pipe are implemented by their name; a type is not', () => {
    const text =
      'load ssg\n  title  str\npaths\nlayout\nget find-one\n  id  i32\nrule nif-letter\n  on field str\n  runs both\n  fails x\npipe upper-case\n  on str\ntype T\n  x  str\n';
    const script = [
      "import { load, paths, layout, findOne, nifLetter } from 'fudic:routes/blog';",
      'load.handle(); paths.handle(); layout.handle(); findOne.handle(); nifLetter.check();',
      // The wrong method implements nothing.
      'nifLetter.handle();',
    ].join('\n');
    const pipe = "import { upperCase } from 'fudic:routes/blog';\nexport default upperCase.implement((v) => v.toUpperCase());";
    expect(lensesOf(text, { [`${SRC}/server/blog.ts`]: script, [`${SRC}/pipes/upper-case.ts`]: pipe })).toEqual([
      ...Array<string>(5).fill('implemented in src/server/blog.ts'),
      'implemented in src/pipes/upper-case.ts',
    ]);
    expect(lensesOf(text, {})).toEqual(Array<string>(6).fill('not implemented'));
  });

  it('two calls in one file are one lens', () => {
    const script = "import { load } from 'fudic:routes/blog';\nload.handle();\nload.handle();";
    expect(lensesOf('load ssr\n  t  str\n', { [`${SRC}/server/blog.ts`]: script })).toEqual(['implemented in src/server/blog.ts']);
  });

  it('a middleware has a lens per half it declares', () => {
    const script = "import { audit } from 'fudic:routes/blog';\naudit.server();";
    expect(lensesOf('middleware audit\n  server\n', { [`${SRC}/server/audit.ts`]: script })).toEqual(['server: src/server/audit.ts']);
    expect(lensesOf('middleware none\n', {})).toEqual([]);
  });
});
