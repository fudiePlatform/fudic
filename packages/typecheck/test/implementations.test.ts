/**
 * SDD-60 §4.6, §4.7 and criteria 18, 22 — the check of a project with `.fudapi`: the handlers of
 * `src/server` and `src/browser` are checked against the generated `.fudic/api`, whatever the
 * `tsconfig.json` lists, and a `.fud` that links a `.fudapi` reads `data` and its functions
 * from `fudic:<id>`.
 */

import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import ts from 'typescript';
import { createFileRegistry, createProjectChecker, toPosix, type CheckReport } from '../src/index.js';
import { parseFud } from '../src/parse.js';
import { indexOf } from './_support.js';

/** `.fud` only: the folders of handlers and the generated types must enter on their own. */
const TSCONFIG = JSON.stringify({
  compilerOptions: { target: 'ES2024', module: 'ESNext', moduleResolution: 'bundler', strict: true, skipLibCheck: true },
  include: ['src/**/*.fud'],
});

/** What `emitDeclarations` would write for `routes/r`, reduced to what the tests read. */
const TYPES = `declare module 'fudic:routes/r' {
  export type LoadData = { readonly n: number };
  export type SaveHandler = (ctx: { readonly args: { readonly id: number } }) => number;
  export const save: ((args: { id: number }) => Promise<number>) & { handle(fn: SaveHandler): void };
}
`;

const API = 'load\n  n  i32\n\nget save\n  id  i32\n  -> i32\n';

const PAGE = (body: string): string =>
  `<!DOCTYPE html>\n<html>\n<head><link rel="server" href="./r.fudapi"><title>t</title></head>\n<body>\n${body}\n</body>\n</html>\n`;

type Files = Readonly<Record<string, string>>;

function project(files: Files): string {
  const root = toPosix(mkdtempSync(join(tmpdir(), 'fudic-impl-')));
  write(root, { 'tsconfig.json': TSCONFIG, '.fudic/api/routes/r.d.ts': TYPES, 'src/routes/r.fudapi': API, ...files });
  return root;
}

function write(root: string, files: Files): void {
  for (const [relative, text] of Object.entries(files)) {
    const file = join(root, relative);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
}

const shown = (report: CheckReport, root: string): string[] =>
  report.problems.map((p) => `${p.file.slice(root.length + 1)} ${p.code}`);

describe('the handlers in the program (criterion 18)', () => {
  it('a handler whose return does not fit its contract is an error of its own .ts', () => {
    const root = project({
      'src/routes/r.fud': PAGE('<p>@data.n</p>'),
      'src/server/r.ts': "import { save } from 'fudic:routes/r';\nsave.handle(() => 'no');\n",
      'src/browser/ok.ts': "import { save } from 'fudic:routes/r';\nexport const call = (): Promise<number> => save({ id: 1 });\n",
      'src/server/types.d.ts': 'export type Ignored = 1;\n',
    });
    const report = createProjectChecker({ root }).check();
    expect(shown(report, root)).toEqual(['src/server/r.ts TS2322']);
    const problem = report.problems[0]!;
    expect(problem.severity).toBe('error');
    expect(problem.span.start).toBeGreaterThan(0);
  });

  it('a handler written after the first check enters once its folder says so', () => {
    const root = project({ 'src/routes/r.fud': PAGE('<p>@data.n</p>') });
    const checker = createProjectChecker({ root });
    expect(checker.check().problems).toEqual([]);
    write(root, { 'src/server/late.ts': "import { save } from 'fudic:routes/r';\nsave.handle(() => 'late');\n" });
    checker.invalidate(`${root}/src/server/late.ts`);
    expect(shown(checker.check(), root)).toEqual(['src/server/late.ts TS2322']);
    // A file of no folder of handlers changes nothing of the list.
    checker.invalidate(`${root}/src/routes/r.fud`);
    expect(shown(checker.check(), root)).toEqual(['src/server/late.ts TS2322']);
  });

  it('criterion 22: with "server": "src/backend", that folder is checked and src/server is not', () => {
    const bad = "import { save } from 'fudic:routes/r';\nsave.handle(() => 'no');\n";
    const root = project({
      'fudic.json': JSON.stringify({ server: 'src/backend' }),
      'src/routes/r.fud': PAGE('<p>@data.n</p>'),
      'src/backend/r.ts': bad,
      'src/server/r.ts': bad,
    });
    expect(shown(createProjectChecker({ root }).check(), root)).toEqual(['src/backend/r.ts TS2322']);
  });
});

/**
 * SDD-40 §6.12 on the new side (SDD-60 §3.4): the route's `layout.handle` returns what its
 * layout declares, the `.d.ts` naming `$Props` of the linked `.fud` (`layoutPropsType`).
 */
describe('the layout contract of a route resolver', () => {
  const LAYOUT = `<!DOCTYPE html>\n<html lang="@culture">\n<head>\n@code {\n  const { culture } = props<{ culture: string; theme?: string }>();\n}\n<title>t</title>\n@RenderHead()\n</head>\n<body>@RenderBody()</body>\n</html>\n`;
  const TYPES_WITH_LAYOUT = `declare module 'fudic:routes/l' {
  export type LayoutHandler = (ctx: unknown, data: undefined) => import('../../../src/layouts/_layout.fud').$Props;
  export const layout: { handle(fn: LayoutHandler): void };
}
`;
  const routed = (handler: string): string =>
    project({
      '.fudic/api/routes/l.d.ts': TYPES_WITH_LAYOUT,
      'src/layouts/_layout.fud': LAYOUT,
      'src/routes/l.fud': '<link rel="layout" href="../layouts/_layout.fud">\n\n<h1>x</h1>\n',
      'src/server/l.ts': `import { layout } from 'fudic:routes/l';\nlayout.handle(() => (${handler}));\n`,
    });

  it('J — a required prop the resolver drops is an error of its own .ts', () => {
    const root = routed("{ theme: 'dark' }");
    expect(shown(createProjectChecker({ root }).check(), root)).toEqual(['src/server/l.ts TS2741']);
  });

  it('J2 — a prop of the wrong type too', () => {
    const root = routed('{ culture: 7 }');
    expect(shown(createProjectChecker({ root }).check(), root)).toEqual(['src/server/l.ts TS2322']);
  });

  it('J3 — what the layout declares says nothing', () => {
    const root = routed("{ culture: 'gl', theme: 'dark' }");
    expect(createProjectChecker({ root }).check().problems).toEqual([]);
  });
});

describe('a .fud with <link rel="server"> (SDD-60 §4.7)', () => {
  it('reads data and its functions from fudic:<id>, typed', () => {
    const root = project({
      'src/routes/r.fud': PAGE('<p>@data.n.toFixed(1)</p>\n<p>@data.nope</p>\n<button @click=@go>go</button>').replace(
        '<title>',
        '@code {\n  const go = (): Promise<number> => save({ id: 1 });\n}\n<title>',
      ),
    });
    expect(shown(createProjectChecker({ root }).check(), root)).toEqual(['src/routes/r.fud TS2339']);
  });

  it('a link without href gives the file nothing (FUD1111 says why)', () => {
    const root = project({ 'src/routes/x.fud': PAGE('<p>x</p>').replace(' href="./r.fudapi"', '') });
    expect(shown(createProjectChecker({ root }).check(), root)).toEqual(['src/routes/x.fud FUD1111']);
  });
});

describe('FudIndex.server', () => {
  const files = { '/p/src/routes/r.fudapi': API, '/p/src/routes/r.ts': '', '/q/x.fudapi': API };

  it('reads the <id>, the load and the names of a linked file', () => {
    const index = indexOf(files);
    expect(index.server('/p/src/routes/r.fud', './r.fudapi')).toEqual({ id: 'routes/r', load: true, names: ['save'] });
  });

  it('nothing for a file of no project, one that is not a .fudapi or one that is not there', () => {
    const index = indexOf(files);
    expect(index.server('/q/y.fud', './x.fudapi')).toBeUndefined();
    expect(index.server('/p/src/routes/r.fud', './r.ts')).toBeUndefined();
    expect(index.server('/p/src/routes/r.fud', './none.fudapi')).toBeUndefined();
  });

  it('a form, and the form a function takes, are names too', () => {
    const index = indexOf({ '/p/src/c.fudapi': 'put save\n  form person\n\nform person\n  name  str\n' });
    expect(index.server('/p/src/x.fud', './c.fudapi')!.names).toEqual(['save', 'person']);
  });
});

describe('what TypeScript says about a handler, filtered', () => {
  /** A TypeScript whose program is wrapped by `wrap`, everything else untouched. */
  const wrappingProgram = (wrap: (program: ts.Program) => ts.Program): typeof ts =>
    ({
      ...ts,
      createLanguageService: (host: ts.LanguageServiceHost) => {
        const service = ts.createLanguageService(host);
        return { ...service, getProgram: () => wrap(service.getProgram()!) };
      },
    }) as typeof ts;

  it('drops a suggestion, a diagnostic with no position and a handler the program does not hold', () => {
    const bad = "import { save } from 'fudic:routes/r';\nsave.handle(() => 'no');\n";
    const root = project({ 'src/routes/r.fud': PAGE('<p>@data.n</p>'), 'src/server/a.ts': bad, 'src/server/b.ts': bad });
    const typescript = wrappingProgram(
      (program) =>
        new Proxy(program, {
          get: (target, key) => {
            if (key === 'getSourceFile') return (name: string) => (name.endsWith('/b.ts') ? undefined : target.getSourceFile(name));
            if (key === 'getSemanticDiagnostics') {
              return (file?: ts.SourceFile) =>
                file?.fileName.endsWith('/a.ts') === true
                  ? target.getSemanticDiagnostics(file).flatMap((d) => [
                      { ...d, category: ts.DiagnosticCategory.Suggestion },
                      { ...d, start: undefined, length: undefined },
                    ])
                  : target.getSemanticDiagnostics(file);
            }
            return Reflect.get(target, key, target);
          },
        }),
    );
    expect(createProjectChecker({ root, typescript }).check().problems).toEqual([]);
  });

  it('a registry over an index that cannot read a .fudapi gives the file nothing', () => {
    const document = parseFud(PAGE('<p>x</p>')).document;
    const registry = createFileRegistry('/p/src/routes/r.fud', document, { resolve: () => undefined, failure: () => undefined });
    expect(registry.servers!()).toEqual([]);
  });
});
