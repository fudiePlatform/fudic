/**
 * The project check (SDD-35 §4.2–§4.6): what the editor marks, over the whole project at once.
 *
 * Over real projects on disk, because the check is a real TypeScript program: the `tsconfig.json`
 * is looked for and parsed by TypeScript, and the lib files come from its own folder. What the
 * tests replace is only what they must to reach a path no real project reaches — a TypeScript
 * that throws, a program that reports a warning.
 */

import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import ts from 'typescript';
import {
  createProjectChecker,
  GLOBALS_DTS,
  nodeFileSystem,
  toPosix,
  type CheckFs,
  type CheckProblem,
  type CheckReport,
} from '../src/index.js';

const TSCONFIG = JSON.stringify({
  compilerOptions: { target: 'ES2024', module: 'ESNext', moduleResolution: 'bundler', strict: true, skipLibCheck: true },
  include: ['**/*.ts', '**/*.fud'],
});

const BADGE = `@code {
  type Tone = 'neutral' | 'success' | 'info';
  const { tone = 'neutral' } = props<{ tone?: Tone }>();
}

<app-badge>
  <template shadowrootmode="open">
    <span class:info="@(tone === 'info')"><slot></slot></span>
  </template>
</app-badge>
`;

const page = (tone: string): string => `<!DOCTYPE html>
<html>
  <head>
    <link rel="component" href="../components/app-badge.fud">
    <title>t</title>
  </head>
  <body>
    <app-badge .tone="@(${tone})">hi</app-badge>
  </body>
</html>
`;

type Files = Readonly<Record<string, string>>;

/** A project on disk; `tsconfig: false` leaves it without one. */
function project(files: Files, options: { readonly tsconfig?: boolean } = {}): string {
  const root = toPosix(mkdtempSync(join(tmpdir(), 'fudic-checker-')));
  const all: Files = options.tsconfig === false ? files : { 'tsconfig.json': TSCONFIG, ...files };
  write(root, all);
  return root;
}

function write(root: string, files: Files): void {
  for (const [relative, text] of Object.entries(files)) {
    const file = join(root, relative);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
}

const BASE: Files = {
  'src/components/app-badge.fud': BADGE,
  'src/routes/index.fud': page(`'info'`),
};

/** `code @ text-under-the-span` for each problem, which is what an assertion wants to read. */
function shown(report: CheckReport, root: string): string[] {
  return report.problems.map((problem) => `${problem.file.slice(root.length + 1)} ${problem.code} ${textOf(problem)}`);
}

function textOf(problem: CheckProblem): string {
  return nodeFileSystem().readFile(problem.file)!.slice(problem.span.start, problem.span.end);
}

/** A TypeScript whose fudic-unrelated parts are `ts`, with some members replaced. */
function typescriptWith(over: Partial<typeof ts>): typeof ts {
  return { ...ts, ...over } as typeof ts;
}

/** A TypeScript whose program is wrapped by `wrap`, everything else untouched. */
function wrappingProgram(wrap: (program: ts.Program) => ts.Program | undefined): typeof ts {
  return typescriptWith({
    createLanguageService: ((host: ts.LanguageServiceHost) => {
      const service = ts.createLanguageService(host);
      return { ...service, getProgram: () => wrap(service.getProgram()!) };
    }) as typeof ts.createLanguageService,
  });
}

/** A program that answers `name` with `answer`, everything else as `program` does. */
function overriding<K extends keyof ts.Program>(program: ts.Program, name: K, answer: ts.Program[K]): ts.Program {
  return new Proxy(program, {
    get: (target, key) => (key === name ? answer : Reflect.get(target, key, target)),
  });
}

describe('createProjectChecker — what it reports', () => {
  it('is clean for a clean project with a tsconfig, and reads nothing before check()', () => {
    const root = project(BASE);
    const reads: string[] = [];
    const fs = nodeFileSystem();
    const checker = createProjectChecker({ root }, { ...fs, readFile: (path) => (reads.push(path), fs.readFile(path)) });
    expect(reads).toEqual([]);

    const report = checker.check();
    expect(report.problems).toEqual([]);
    expect(report.project).toEqual([]);
    expect(report.inputs.map(toPosix)).toContain(`${root}/src/routes/index.fud`);
    expect(report.inputs.some((input) => input.endsWith('tsconfig.json') || input.endsWith('.d.ts'))).toBe(true);
  });

  it('reports a value outside a union as one TS2322 on `tone` (criterion 2)', () => {
    const root = project({ ...BASE, 'src/routes/index.fud': page('42') });
    const report = createProjectChecker({ root }).check();

    expect(shown(report, root)).toEqual(['src/routes/index.fud TS2322 tone']);
    expect(report.problems[0]).toMatchObject({ severity: 'error', file: `${root}/src/routes/index.fud` });
    expect(report.problems[0]?.message).toContain('not assignable');
  });

  it('checks a component nobody links, and every consumer of a changed type (criteria 7, 8)', () => {
    const root = project({
      'src/components/app-badge.fud': BADGE.replace(`| 'info'`, ''),
      'src/routes/index.fud': page(`'info'`),
      'src/routes/about.fud': page(`'info'`),
      'src/components/orphan-x.fud': `@code {\n  const n: number = 'x';\n}\n<orphan-x>\n  <template shadowrootmode="open"><p>@n</p></template>\n</orphan-x>\n`,
    });
    const report = createProjectChecker({ root }).check();

    expect(shown(report, root)).toEqual([
      "src/components/app-badge.fud TS2367 tone === 'info'",
      'src/components/orphan-x.fud TS2322 n',
      'src/routes/about.fud TS2322 tone',
      'src/routes/index.fud TS2322 tone',
    ]);
  });

  it('reports the fudic rules too, with their severity, and drops the hints (§4.3)', () => {
    const root = project({
      ...BASE,
      'src/routes/index.fud': page(`'info'`).replace('</body>', '  <app-ghost></app-ghost>\n  </body>'),
      'src/routes/broken.fud': page(`'info'`).replace('app-badge.fud', 'nowhere.fud'),
    });
    const report = createProjectChecker({ root }).check();
    const codes = report.problems.map((problem) => `${problem.file.slice(root.length + 1)} ${problem.code}`);

    expect(codes).toContain('src/routes/index.fud FUD0191');
    expect(codes).toContain('src/routes/broken.fud FUD0460');
    for (const problem of report.problems) expect(['error', 'warning']).toContain(problem.severity);
  });

  it('projects a file that does not parse, so its consumers do not cascade', () => {
    const root = project({ ...BASE, 'src/components/app-badge.fud': BADGE.replace('</span>', '') });
    const report = createProjectChecker({ root }).check();

    expect(report.problems.length).toBeGreaterThan(0);
    expect(report.problems.every((problem) => problem.file.endsWith('app-badge.fud'))).toBe(true);
  });

  it('types $Data from the .fud.server virtual, as the editor does', () => {
    const route = `<link rel="layout" href="../layouts/_layout.fud">

@code {
  @server {
    export function load(): { n: number } { return { n: 1 }; }
  }
}

<p>@data.missing</p>
`;
    const layout = `<!DOCTYPE html>
<html>
  <head>
    @RenderHead()
  </head>
  <body>@RenderBody()</body>
</html>
`;
    const root = project({ 'src/routes/index.fud': route, 'src/layouts/_layout.fud': layout });
    const report = createProjectChecker({ root }).check();

    expect(shown(report, root)).toEqual(['src/routes/index.fud TS2339 missing']);
  });

  it('reports the declaration diagnostics when the tsconfig asks for declarations', () => {
    const tsconfig = JSON.stringify({
      compilerOptions: { strict: true, declaration: true, skipLibCheck: true, module: 'ESNext', moduleResolution: 'bundler' },
      include: ['**/*.ts', '**/*.fud'],
    });
    const root = project({ ...BASE, 'tsconfig.json': tsconfig });

    expect(createProjectChecker({ root }).check().problems).toEqual([]);
  });

  it('warns FUD0870 without a tsconfig and still checks (criterion 11)', () => {
    const root = project({ ...BASE, 'src/routes/index.fud': page('42') }, { tsconfig: false });
    const report = createProjectChecker({ root, typescript: typescriptWith({ findConfigFile: () => undefined }) }).check();

    expect(report.project.map((problem) => `${problem.code} ${problem.severity}`)).toEqual(['FUD0870 warning']);
    expect(shown(report, root)).toEqual(['src/routes/index.fud TS2322 tone']);
  });

  it('serves GLOBALS_DTS over a stale fudic-globals.d.ts: no TS2300 (criterion 10)', () => {
    const root = project({ ...BASE, 'src/fudic-globals.d.ts': 'declare function props(): string;\n' });
    const report = createProjectChecker({ root }).check();

    expect(GLOBALS_DTS).toContain('props');
    expect(report.problems).toEqual([]);
  });

  it("keeps a library's own errors silent, though its file is in the program (criterion 12)", () => {
    const root = project({
      'package.json': JSON.stringify({ name: 'app', dependencies: { '@acme/ui': '1.0.0' } }),
      'node_modules/@acme/ui/package.json': JSON.stringify({ name: '@acme/ui', version: '1.0.0' }),
      'node_modules/@acme/ui/fudic.json': JSON.stringify({ kind: 'lib', prefix: 'acme' }),
      'node_modules/@acme/ui/acme-card.fud': `@code {\n  const n: number = 'broken';\n  const { size } = props<{ size: number }>();\n}\n<acme-card>\n  <template shadowrootmode="open"><p>@n @size</p></template>\n</acme-card>\n`,
      'src/routes/index.fud': `<!DOCTYPE html>
<html>
  <head>
    <link rel="component" href="@acme/ui/acme-card.fud">
    <title>t</title>
  </head>
  <body>
    <acme-card .size="@(1)"></acme-card>
  </body>
</html>
`,
    });
    const report = createProjectChecker({ root }).check();

    expect(report.problems).toEqual([]);
    expect(report.inputs.map((input) => toPosix(input).toLowerCase())).toContain(
      `${root}/node_modules/@acme/ui/acme-card.fud`.toLowerCase(),
    );
  });

  it('sorts by path, offset and code, and two runs give the same report (criterion 17)', () => {
    const root = project({
      ...BASE,
      'src/routes/index.fud': page('42'),
      'src/routes/about.fud': page(`'bogus'`),
    });
    const first = createProjectChecker({ root }).check();
    const second = createProjectChecker({ root }).check();

    expect(shown(first, root)).toEqual(['src/routes/about.fud TS2322 tone', 'src/routes/index.fud TS2322 tone']);
    expect(second.problems).toEqual(first.problems);
  });

  it('works with a case-sensitive file system too', () => {
    const root = project({ ...BASE, 'src/routes/index.fud': page('42') });
    const sys = { ...ts.sys, useCaseSensitiveFileNames: true };
    const report = createProjectChecker({ root, typescript: typescriptWith({ sys }) }).check();

    expect(shown(report, root)).toEqual(['src/routes/index.fud TS2322 tone']);
  });
});

describe('createProjectChecker — the live program (§4.5)', () => {
  it('invalidating before the first check does nothing', () => {
    const root = project(BASE);
    const checker = createProjectChecker({ root });
    checker.invalidate(`${root}/src/routes/index.fud`);

    expect(checker.check().problems).toEqual([]);
  });

  it('re-reads a .fud that changed, and every consumer of a component whose type changed', () => {
    const root = project(BASE);
    const checker = createProjectChecker({ root });
    expect(checker.check().problems).toEqual([]);

    write(root, { 'src/routes/index.fud': page('42') });
    checker.invalidate(`${root}/src/routes/index.fud`);
    expect(shown(checker.check(), root)).toEqual(['src/routes/index.fud TS2322 tone']);

    write(root, { 'src/routes/index.fud': page(`'info'`), 'src/components/app-badge.fud': BADGE.replace(`| 'info'`, `| 'warn'`) });
    checker.invalidate(`${root}/src/routes/index.fud`);
    checker.invalidate(`${root}/src/components/app-badge.fud`);
    expect(shown(checker.check(), root)).toEqual([
      "src/components/app-badge.fud TS2367 tone === 'info'",
      'src/routes/index.fud TS2322 tone',
    ]);
  });

  it('sees a .fud that appears and one that goes away', () => {
    const root = project(BASE);
    const checker = createProjectChecker({ root });
    checker.check();

    write(root, { 'src/routes/about.fud': page('42') });
    checker.invalidate(`${root}/src/routes/about.fud`);
    expect(shown(checker.check(), root)).toEqual(['src/routes/about.fud TS2322 tone']);

    rmSync(join(root, 'src/routes/about.fud'));
    checker.invalidate(`${root}/src/routes/about.fud`);
    expect(checker.check().problems).toEqual([]);

    // A path the project never had changes nothing, and costs no re-projection.
    checker.invalidate(`${root}/src/routes/never.fud`);
    expect(checker.check().problems).toEqual([]);
  });

  it('forgets a component that goes away while a page still links it', () => {
    const root = project(BASE);
    const checker = createProjectChecker({ root });
    checker.check();

    rmSync(join(root, 'src/components/app-badge.fud'));
    checker.invalidate(`${root}/src/components/app-badge.fud`);
    expect(checker.check().problems.map((problem) => problem.code)).toContain('FUD0460');
  });

  it('re-reads a .ts the program read', () => {
    const root = project({
      'src/data.ts': 'export const tone = "info" as const;\n',
      'src/components/app-badge.fud': BADGE,
      'src/routes/index.fud': page('tone').replace('<title>t</title>', '<title>t</title>\n@code {\n  import { tone } from "../data";\n}'),
    });
    const checker = createProjectChecker({ root });
    expect(checker.check().problems).toEqual([]);

    write(root, { 'src/data.ts': 'export const tone = 42;\n' });
    checker.invalidate(`${root}/src/data.ts`);
    expect(shown(checker.check(), root)).toEqual(['src/routes/index.fud TS2322 tone']);
  });

  it('starts over when the tsconfig.json changes', () => {
    const config = (strict: boolean): string =>
      JSON.stringify({ compilerOptions: { strict, skipLibCheck: true }, include: ['**/*.ts', '**/*.fud'] });
    const root = project({
      'tsconfig.json': config(false),
      'src/components/app-x.fud': `@code {\n  function twice(x) { return x + x; }\n}\n<app-x>\n  <template shadowrootmode="open"><p>@twice(1)</p></template>\n</app-x>\n`,
    });
    const checker = createProjectChecker({ root });
    expect(checker.check().problems).toEqual([]);

    write(root, { 'tsconfig.json': config(true) });
    checker.invalidate(`${root}/tsconfig.json`);
    expect(shown(checker.check(), root)).toEqual(['src/components/app-x.fud TS7006 x']);
  });
});

describe('createProjectChecker — a check that could not run (§5.5)', () => {
  it('is FUD0871 and not an empty report when TypeScript throws, and recovers afterwards (criterion 16)', () => {
    const root = project({ ...BASE, 'src/routes/index.fud': page('42') });
    let fail = true;
    const typescript = typescriptWith({
      createLanguageService: ((host: ts.LanguageServiceHost) => {
        if (fail) throw new Error('boom');
        return ts.createLanguageService(host);
      }) as typeof ts.createLanguageService,
    });
    const checker = createProjectChecker({ root, typescript });

    const failed = checker.check();
    expect(failed.problems).toEqual([]);
    expect(failed.project).toEqual([
      { code: 'FUD0871', severity: 'error', message: 'the typecheck could not run: boom' },
    ]);

    fail = false;
    expect(shown(checker.check(), root)).toEqual(['src/routes/index.fud TS2322 tone']);
  });

  it('says what was thrown when it is not an Error', () => {
    const root = project(BASE);
    const typescript = typescriptWith({
      createLanguageService: (() => {
        throw 'not an error';
      }) as typeof ts.createLanguageService,
    });

    expect(createProjectChecker({ root, typescript }).check().project[0]?.message).toBe(
      'the typecheck could not run: not an error',
    );
  });

  it('is FUD0871 when TypeScript builds no program', () => {
    const root = project(BASE);
    const report = createProjectChecker({ root, typescript: wrappingProgram(() => undefined) }).check();

    expect(report.project[0]?.message).toBe('the typecheck could not run: TypeScript built no program');
  });
});

describe('createProjectChecker — what TypeScript says, filtered', () => {
  it('maps a TypeScript warning to a warning, and drops suggestions and messages', () => {
    const root = project({ ...BASE, 'src/routes/index.fud': page('42') });
    const asCategory = (category: ts.DiagnosticCategory) =>
      wrappingProgram((program) =>
        overriding(program, 'getSemanticDiagnostics', (file?: ts.SourceFile) =>
          program.getSemanticDiagnostics(file).map((diagnostic) => ({ ...diagnostic, category })),
        ),
      );

    const warned = createProjectChecker({ root, typescript: asCategory(ts.DiagnosticCategory.Warning) }).check();
    expect(warned.problems.map((problem) => `${problem.code} ${problem.severity}`)).toEqual(['TS2322 warning']);

    const suggested = createProjectChecker({ root, typescript: asCategory(ts.DiagnosticCategory.Suggestion) }).check();
    expect(suggested.problems).toEqual([]);
  });

  it('drops a diagnostic with no position, and one that falls in scaffolding', () => {
    const root = project(BASE);
    const typescript = wrappingProgram((program) =>
      overriding(program, 'getSemanticDiagnostics', (file?: ts.SourceFile) => [
        ...program.getSemanticDiagnostics(file),
        { category: ts.DiagnosticCategory.Error, code: 9999, messageText: 'no position', file, start: undefined, length: undefined },
        // The last character of a virtual is the projection's own closing, mapped to nothing.
        { category: ts.DiagnosticCategory.Error, code: 9998, messageText: 'scaffolding', file, start: file!.text.length - 1, length: 1 },
      ]),
    );

    expect(createProjectChecker({ root, typescript }).check().problems).toEqual([]);
  });

  it('skips a virtual the program does not hold', () => {
    const root = project({ ...BASE, 'src/routes/index.fud': page('42') });
    const typescript = wrappingProgram((program) =>
      overriding(program, 'getSourceFile', (name: string) =>
        name.endsWith('.fud.server.ts') ? undefined : program.getSourceFile(name),
      ),
    );

    expect(createProjectChecker({ root, typescript }).check().problems.map((problem) => problem.code)).toEqual(['TS2322']);
  });

  it('skips an indexed file that is gone by the time the program reads it', () => {
    const root = project(BASE);
    const fs = nodeFileSystem();
    const ghost = `${root}/src/components/app-ghost.fud`;
    let indexed = false;
    // The index reads it once; afterwards it is gone, as between a watcher event and a read.
    const flaky: CheckFs = {
      ...fs,
      fudFiles: (at) => [...fs.fudFiles(at), ghost],
      readFile: (path) => {
        if (path !== ghost) return fs.readFile(path);
        if (indexed) return undefined;
        indexed = true;
        return '<app-ghost>\n  <template shadowrootmode="open"></template>\n</app-ghost>\n';
      },
    };

    expect(createProjectChecker({ root }, flaky).check().problems).toEqual([]);
  });
});
