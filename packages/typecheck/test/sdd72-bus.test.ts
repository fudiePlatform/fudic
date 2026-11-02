/**
 * SDD-72 §4.5 — the batch sees the bus registry of the whole project, so `pnpm typecheck` gives
 * the same `TS2345` in the emitter's `emit` that the editor gives.
 *
 * The registry of a receiver is a `declare global` in ITS projection; the error is in the
 * EMITTER's. That only meets if every `.fud` is in one program, the ones the `tsconfig` does not
 * list included (task 12). And `examples/basic` itself, as its build checks it (criterion 26).
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createProjectChecker, nodeFileSystem, toPosix, type CheckFs, type CheckReport } from '../src/index.js';

/** The types of `@fudic/dom`, from the package of this repository — what an app installs. */
const DOM_TYPES = toPosix(fileURLToPath(new URL('../../dom/dist/index.d.ts', import.meta.url)));

/** A project on disk whose `tsconfig` lists only `included`; `@fudic/dom` maps to its types. */
function project(files: Readonly<Record<string, string>>, included: readonly string[]): string {
  const root = toPosix(mkdtempSync(join(tmpdir(), 'fudic-sdd72-')));
  const tsconfig = JSON.stringify({
    compilerOptions: {
      target: 'ES2024',
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: true,
      skipLibCheck: true,
      paths: { '@fudic/dom': [DOM_TYPES] },
    },
    include: included,
  });
  for (const [relative, text] of Object.entries({ 'tsconfig.json': tsconfig, ...files })) {
    const file = join(root, relative);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  return root;
}

const component = (tag: string, code: string, markup: string): string =>
  `@code {\n${code}\n}\n\n<${tag}>\n  <template shadowrootmode="open">\n    ${markup}\n  </template>\n</${tag}>\n`;

const RECEIVER = component(
  'x-alta',
  '  type Person = { readonly id: number; readonly name: string };\n  function alta(persona: Person) { void persona; }',
  '<div bus:alta=@alta></div>',
);

const sender = (detail: string): string =>
  component(
    'x-sender',
    `  import { emit } from '@fudic/dom';\n  function go() { emit("alta", ${detail}); }`,
    '<button @click=@go()>go</button>',
  );

/** `file code text` for each problem, `text` being what the span underlines in `source`. */
function shown(report: CheckReport, root: string, read: (path: string) => string | undefined): string[] {
  return report.problems.map(
    (p) => `${p.file.slice(root.length + 1)} ${p.code} ${read(p.file)!.slice(p.span.start, p.span.end)}`,
  );
}

describe('the batch sees every receiver (task 12)', () => {
  const files = (detail: string) => ({ 'src/x-alta.fud': RECEIVER, 'src/x-sender.fud': sender(detail) });

  it('an emit of the wrong type is TS2345 on the argument, in the emitter', () => {
    const root = project(files('"x"'), ['src/**/*.fud']);
    const report = createProjectChecker({ root }).check();
    expect(shown(report, root, nodeFileSystem().readFile)).toEqual(['src/x-sender.fud TS2345 "x"']);
  });

  it('and nothing with the right one', () => {
    const root = project(files('{ id: 1, name: "a" }'), ['src/**/*.fud']);
    expect(createProjectChecker({ root }).check().problems).toEqual([]);
  });

  it('even when the tsconfig lists only the emitter: the receiver is in the program all the same', () => {
    const root = project(files('"x"'), ['src/x-sender.fud']);
    const report = createProjectChecker({ root }).check();
    expect(shown(report, root, nodeFileSystem().readFile)).toEqual(['src/x-sender.fud TS2345 "x"']);
  });
});

describe('examples/basic, as its build checks it (criterion 26)', () => {
  const ROOT = toPosix(fileURLToPath(new URL('../../../examples/basic', import.meta.url)));
  const USER_FORM = `${ROOT}/src/components/user-form.fud`;

  /** The real filesystem, with `user-form.fud` read as `edit` makes it. */
  function editing(edit: (source: string) => string): CheckFs {
    const fs = nodeFileSystem();
    return { ...fs, readFile: (path) => (toPosix(path) === USER_FORM ? edit(fs.readFile(path)!) : fs.readFile(path)) };
  }

  it('is clean in user-form and usuarios as it is', { timeout: 120_000 }, () => {
    const report = createProjectChecker({ root: ROOT }).check();
    const mine = report.problems.filter((p) => /user-form\.fud|usuarios\.fud/u.test(p.file));
    expect(mine).toEqual([]);
  });

  it('usuarios.fud delegated: borrar(p: number) is TS2345 on the p of the handler (criterion 39)', { timeout: 120_000 }, () => {
    const USUARIOS = `${ROOT}/src/routes/usuarios.fud`;
    const base = nodeFileSystem();
    const fs: CheckFs = {
      ...base,
      readFile: (path) =>
        toPosix(path) === USUARIOS
          ? base.readFile(path)!.replace('async function borrar(p: Person)', 'async function borrar(p: number)')
          : base.readFile(path),
    };
    expect(fs.readFile(USUARIOS)).toContain('async function borrar(p: number)');
    const report = createProjectChecker({ root: ROOT }, fs).check();
    const mine = shown(report, ROOT, fs.readFile).filter((line) => line.startsWith('src/routes/usuarios.fud'));
    expect(mine).toContain('src/routes/usuarios.fud TS2345 p');
    const source = fs.readFile(USUARIOS)!;
    const handler = source.indexOf('@borrar(p)') + '@borrar('.length;
    expect(report.problems.some((p) => p.file.endsWith('usuarios.fud') && p.span.start === handler && p.code === 'TS2345')).toBe(true);
  });

  it('emit("alta", "x") in user-form is TS2345 on the "x"', { timeout: 120_000 }, () => {
    const fs = editing((source) => source.replace('emit("alta", persona);', 'emit("alta", "x");'));
    const report = createProjectChecker({ root: ROOT }, fs).check();
    const mine = shown(report, ROOT, fs.readFile).filter((line) => line.startsWith('src/components/user-form.fud'));
    expect(mine).toEqual(['src/components/user-form.fud TS2345 "x"']);
  });
});
