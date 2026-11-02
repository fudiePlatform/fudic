/**
 * SDD-75 §4.2 — the index of who implements what, and the lenses it gives: every way a script can
 * name a piece, and every place a script can be.
 */

import { describe, expect, it } from 'vitest';
import { ImplementationIndex, implementationsIn } from '../../src/fudapi/implementations.js';
import { implementationLenses } from '../../src/fudapi/lenses.js';
import { APP, FILES, SRC, apiDocument, apiFs, world } from './_api.js';

const found = (text: string, file = 'a.ts') => implementationsIn(file, text).map((i) => `${i.id}:${i.name}.${i.method}`);

describe('implementationsIn', () => {
  it('a call on a name imported from `fudic:`, under any local name', () => {
    expect(found("import { save as guardar } from 'fudic:routes/u';\nguardar.handle(() => {});")).toEqual(['routes/u:save.handle']);
    expect(found("import { 'save' as s } from 'fudic:routes/u';\ns.handle(() => {});")).toEqual(['routes/u:save.handle']);
  });

  it('the four methods, nested anywhere in the module, and plain JavaScript too', () => {
    const text = "import { a, b, c, d } from 'fudic:x';\nexport function f() { a.handle(); if (1) { b.check(); } }\nc.client();\nd.server();";
    expect(found(text)).toEqual(['x:a.handle', 'x:b.check', 'x:c.client', 'x:d.server']);
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

  it("an app: its src/server and src/browser, at any depth, scripts only, by the file's <id>", () => {
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
    const files = new ImplementationIndex(fs).of(APP, `${SRC}/routes/u.fudapi`, 'routes/u').map((i) => i.file);
    expect(files).toEqual([`${SRC}/server/a.ts`, `${SRC}/server/deep/b.mts`, `${SRC}/browser/c.js`]);
  });

  it('a library: its own server/ and browser/, by its package name', () => {
    const lib = '/ws/forms';
    const fs = apiFs({
      [`${lib}/package.json`]: JSON.stringify({ name: '@fudic/forms' }),
      [`${lib}/fudapi/rules.fudapi`]: 'rule required\n',
      [`${lib}/browser/rules.js`]: "import { required } from 'fudic:@fudic/forms/rules';\nrequired.check(() => true);",
    });
    const found = new ImplementationIndex(fs).of(lib, `${lib}/fudapi/rules.fudapi`, 'rules');
    expect(found.map((i) => `${i.file}:${i.name}`)).toEqual([`${lib}/browser/rules.js:required`]);
  });

  it('a library whose package.json names nothing, or is being written, implements nothing', () => {
    const lib = '/ws/forms';
    const script = { [`${lib}/browser/rules.js`]: "import { required } from 'fudic:undefined/rules';\nrequired.check();" };
    for (const pkg of [JSON.stringify({}), '{', undefined]) {
      const fs = apiFs({ ...script, ...(pkg !== undefined ? { [`${lib}/package.json`]: pkg } : {}) });
      expect(new ImplementationIndex(fs).of(lib, `${lib}/fudapi/rules.fudapi`, 'rules')).toEqual([]);
    }
  });

  it('reads a script once, and again after it changed; a new one after any change', () => {
    const files: Record<string, string | undefined> = { [`${SRC}/server/a.ts`]: HANDLES };
    const fs = apiFs(files);
    const index = new ImplementationIndex(fs);
    const of = () => index.of(APP, `${SRC}/routes/u.fudapi`, 'routes/u').map((i) => i.file);
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

describe('implementationLenses', () => {
  const PROJECT = APP;
  const lensesOf = (text: string, scripts: Readonly<Record<string, string>>): readonly string[] => {
    const { host, implementations } = world({ files: { ...FILES, ...scripts } });
    const doc = apiDocument(host, text, `${SRC}/routes/blog.fudapi`);
    return implementationLenses(doc, PROJECT, implementations.of(PROJECT, doc.path, doc.source.id)).map((l) => l.command!.title);
  };

  it('`load`, `paths`, `layout`, a function and a rule are implemented by their name; a type is not', () => {
    const text = 'load ssg\n  title  str\npaths\nlayout\nget find-one\n  id  i32\nrule nif-letter\n  on field str\n  runs both\n  fails x\ntype T\n  x  str\n';
    const script = [
      "import { load, paths, layout, findOne, nifLetter } from 'fudic:routes/blog';",
      'load.handle(); paths.handle(); layout.handle(); findOne.handle(); nifLetter.check();',
      // The wrong method implements nothing.
      'nifLetter.handle();',
    ].join('\n');
    expect(lensesOf(text, { [`${SRC}/server/blog.ts`]: script })).toEqual(Array(5).fill('implemented in src/server/blog.ts'));
    expect(lensesOf(text, {})).toEqual(Array(5).fill('not implemented'));
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
