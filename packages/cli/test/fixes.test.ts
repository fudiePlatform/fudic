/**
 * What a `.md` says works (SDD-62 §4.2, criteria 5 and 6): every live code whose `**Fix:**`
 * carries a code example, and that a `.fud`, a `.fudspec` or a `.fudapi` gives, has a pair of
 * files in `packages/diagnostics/fixtures/` — the broken one gives that code and no other error,
 * the fixed one gives nothing at all.
 *
 * It lives here and not in `@fudic/diagnostics` because the passes it runs depend on that
 * package: declaring them there would be a cycle in the workspace, and the build order with it.
 *
 * Which codes. A code is on the list when its `**Fix:**` has a fragment between backticks with
 * `<`, `@` or `{`, and its name appears in the source of a package of the language passes
 * (`PASSES`). Both read from the disk, so a new code joins the list on its own; a code that only
 * the CLI, `fudic.json`, the bench or the plugin's own checks give is reviewed by hand.
 *
 * A pair is `fixtures/FUDnnnn.<ext>` + `fixtures/FUDnnnn.fixed.<ext>`, copied into `src/` of a
 * project of its own; or a folder `fixtures/FUDnnnn/`, copied as it is to the root of the
 * project, holding support files and exactly one `<name>.fixed.<ext>` beside its `<name>.<ext>`.
 * The fixed file is checked under the broken one's name: file names and tags matter. A project
 * without a `fudic.json` or a `tsconfig.json` gets the defaults below.
 *
 * The passes are the build's: `transformFud` over every `.fud` (the emit set), the project
 * checker of `@fudic/typecheck` (the typed set), `ApiProject` for the `.fudapi`, and
 * `parseSpec` + `validateSpec` for the `.fudspec`. Run one code with `-t FUDnnnn`.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { explain } from '@fudic/diagnostics/explain';
import { createTermCatalog, parseSpec, readFixtures, validateSpec, type SpecContext, type SpecFs } from '@fudic/spec';
import { createProjectChecker, parseFud, tagOf } from '@fudic/typecheck';
import { nodeIo, transformFud } from '@fudic/vite';
import { ApiProject } from '@fudic/vite/harness';
import { afterAll, describe, expect, it } from 'vitest';

const posix = (path: string): string => path.replace(/\\/gu, '/');
const at = (path: string): string => posix(fileURLToPath(new URL(path, import.meta.url))).replace(/\/$/u, '');

const PACKAGES = at('../../');
const CODES = `${PACKAGES}/diagnostics/src/codes`;
const FIXTURES = `${PACKAGES}/diagnostics/fixtures`;
/** The framework's terms, as a project that installed `@fudic/terms` reads them. */
const FRAMEWORK_TERMS = `${PACKAGES}/terms/terms`;
/** So that a fixture's `import` of a package resolves as it does in a project of this repository. */
const NODE_MODULES = `${PACKAGES}/cli/node_modules`;

/** The packages whose source gives a code from a `.fud`, a `.fudspec` or a `.fudapi`. */
const PASSES = ['compiler', 'language-core', 'resolve', 'typecheck', 'spec', 'api'] as const;

const EXTENSIONS = ['fud', 'fudspec', 'fudapi'] as const;
const FIXED = new RegExp(`\\.fixed\\.(${EXTENSIONS.join('|')})$`, 'u');

const FUDIC_JSON = JSON.stringify({ id: 'fixes', kind: 'app' });
const TSCONFIG = JSON.stringify({
  compilerOptions: {
    target: 'ES2024',
    module: 'ESNext',
    moduleResolution: 'bundler',
    lib: ['ES2024', 'DOM', 'DOM.Iterable'],
    strict: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    isolatedModules: true,
    verbatimModuleSyntax: true,
    skipLibCheck: true,
    noEmit: true,
  },
  include: ['src/**/*.ts', 'src/**/*.fud', '.fudic/api/**/*.d.ts'],
});

/** Every file under `dir`, POSIX, `node_modules` and dot folders left out. */
function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) return [];
    const path = `${dir}/${entry.name}`;
    return entry.isDirectory() ? walk(path) : [path];
  });
}

/** The codes whose `**Fix:**` shows code: a backtick fragment with `<`, `@` or `{`. */
function withExample(): string[] {
  return readdirSync(CODES)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.slice(0, -'.md'.length))
    .filter((code) => [...(explain(code)?.fix ?? '').matchAll(/`([^`]*)`/gu)].some((m) => /[<@{]/u.test(m[1]!)))
    .sort();
}

/** The source of the language passes, read once. */
const passSource = PASSES.flatMap((pkg) => walk(`${PACKAGES}/${pkg}/src`))
  .filter((f) => f.endsWith('.ts'))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');

const listed = withExample().filter((code) => new RegExp(`\\b${code}\\b`, 'u').test(passSource));

/** One pair, as files relative to the project root: what the broken project and the fixed one hold. */
interface Pair {
  /** The broken file, from the root; the fixed one is checked under this same name. */
  readonly file: string;
  readonly broken: ReadonlyMap<string, string>;
  readonly fixed: ReadonlyMap<string, string>;
}

/** The pair of `code`, or why there is none. */
function pairOf(code: string): Pair | string {
  const folder = `${FIXTURES}/${code}`;
  if (existsSync(folder) && statSync(folder).isDirectory()) {
    const files = walk(folder).map((f) => f.slice(folder.length + 1));
    const fixed = files.filter((f) => FIXED.test(f));
    if (fixed.length !== 1) return `${code}: fixtures/${code}/ holds ${fixed.length} *.fixed.<ext>, not one`;
    const fixedFile = fixed[0]!;
    const file = fixedFile.replace(/\.fixed(\.\w+)$/u, '$1');
    if (!files.includes(file)) return `${code}: fixtures/${code}/${fixedFile} has no broken ${file} beside it`;
    const support = files.filter((f) => f !== file && f !== fixedFile).map((f) => [f, `${folder}/${f}`] as const);
    return {
      file,
      broken: new Map([...support, [file, `${folder}/${file}`]]),
      fixed: new Map([...support, [file, `${folder}/${fixedFile}`]]),
    };
  }
  for (const ext of EXTENSIONS) {
    const broken = `${FIXTURES}/${code}.${ext}`;
    const fixed = `${FIXTURES}/${code}.fixed.${ext}`;
    if (!existsSync(broken) && !existsSync(fixed)) continue;
    if (!existsSync(broken)) return `${code}: fixtures/${code}.fixed.${ext} has no broken fixtures/${code}.${ext}`;
    if (!existsSync(fixed)) return `${code}: fixtures/${code}.${ext} has no fixtures/${code}.fixed.${ext}`;
    const file = `src/${code}.${ext}`;
    return { file, broken: new Map([[file, broken]]), fixed: new Map([[file, fixed]]) };
  }
  return `${code}: no pair in packages/diagnostics/fixtures/ (${code}.<ext> + ${code}.fixed.<ext>, or ${code}/)`;
}

/** One diagnostic, as the test prints it. */
interface Found {
  readonly file: string;
  readonly code: string;
  readonly severity: string;
  readonly start: number;
  readonly message: string;
}

const projects: string[] = [];
afterAll(() => {
  for (const root of projects) rmSync(root, { recursive: true, force: true });
});

/** A project of its own holding `files` (root-relative path → source file). */
function project(files: ReadonlyMap<string, string>): string {
  const root = posix(mkdtempSync(join(tmpdir(), 'fudic-fixes-')));
  projects.push(root);
  for (const [path, from] of files) {
    mkdirSync(dirname(`${root}/${path}`), { recursive: true });
    cpSync(from, `${root}/${path}`);
  }
  if (!files.has('fudic.json')) writeFileSync(`${root}/fudic.json`, FUDIC_JSON);
  if (!files.has('tsconfig.json')) writeFileSync(`${root}/tsconfig.json`, TSCONFIG);
  symlinkSync(NODE_MODULES, `${root}/node_modules`, 'junction');
  return root;
}

const nodeSpecFs: SpecFs = {
  readDirectory: (path) => (existsSync(path) ? readdirSync(path) : []),
  readFile: (path) => (existsSync(path) ? readFileSync(path, 'utf8') : undefined),
};

/** What the build, the typed pass and the validators say about every file of the project at `root`. */
function check(root: string): Found[] {
  const found: Found[] = [];
  const add = (file: string, d: { code: string; severity: string; span: { start: number }; message: string }): void => {
    found.push({ file: posix(relative(root, file)), code: d.code, severity: d.severity, start: d.span.start, message: d.message });
  };
  const files = walk(root);

  // The `.fudapi`: parsed and validated, and their declarations written, as the build does.
  const api = new ApiProject(root);
  for (const { file, diagnostics } of api.diagnostics()) for (const d of diagnostics) add(file, d);
  api.writeDeclarations();

  // The emit set of every `.fud`.
  const io = nodeIo((path) => api.linked(path));
  for (const file of files.filter((f) => f.endsWith('.fud'))) {
    for (const d of transformFud(file, io)?.diagnostics ?? []) add(file, d);
  }

  // The typed set, over the whole project.
  const checker = createProjectChecker({ root });
  const report = checker.check();
  for (const p of report.problems) add(p.file, p);
  for (const p of report.project) found.push({ file: '', code: p.code, severity: p.severity, start: 0, message: p.message });

  // The `.fudspec`, against the project's components, fixtures and terms.
  const components = files
    .filter((f) => f.endsWith('.fud'))
    .map((path) => ({ path, tag: tagOf(parseFud(readFileSync(path, 'utf8')).document) }))
    .filter((c) => c.tag !== '');
  const component = (tag: string) => components.find((c) => c.tag === tag);
  const context: SpecContext = {
    terms: createTermCatalog(
      [
        { layer: 'workspace', path: `${root}/fudic/terms` },
        { layer: 'framework', path: FRAMEWORK_TERMS },
      ],
      nodeSpecFs,
    ),
    component(tag) {
      const c = component(tag);
      if (c === undefined) return undefined;
      const props = checker.propShapes(c.path);
      return {
        tag,
        path: c.path,
        requiredProps: props === undefined ? 'unknown' : props.filter((p) => p.required).map((p) => p.name),
      };
    },
    fixtures(tag) {
      const c = component(tag);
      const path = c === undefined ? undefined : `${dirname(c.path)}/${tag}.fixture.ts`;
      const source = path === undefined ? undefined : nodeSpecFs.readFile(path);
      return source === undefined ? undefined : readFixtures(source, path!);
    },
  };
  for (const file of files.filter((f) => f.endsWith('.fudspec'))) {
    const parsed = parseSpec(readFileSync(file, 'utf8'));
    for (const d of [...parsed.diagnostics, ...validateSpec(parsed.value, context)]) add(file, d);
  }

  // The emit set and the typed set share the parse: one fact, said once here.
  const byFact = new Map(found.map((f) => [`${f.file}|${f.start}|${f.code}`, f]));
  return [...byFact.values()];
}

const print = (found: readonly Found[]): string[] => found.map((f) => `${f.file}@${f.start} ${f.code} ${f.severity}: ${f.message}`);

describe('the list of codes whose Fix is checked by a pair (criterion 5)', () => {
  it('is read from the catalogue and the passes, not written by hand', () => {
    // A code the compiler gives, with an example in its Fix: if it falls off, the rule broke.
    expect(listed).toContain('FUD0540');
    expect(listed.length).toBeGreaterThan(100);
  });

  it('every folder or file in fixtures/ belongs to a code of the list', () => {
    const entries = existsSync(FIXTURES) ? readdirSync(FIXTURES) : [];
    const stray = entries.filter((name) => !listed.includes(/^FUD\d{4}/u.exec(name)?.[0] ?? ''));
    expect(stray).toEqual([]);
  });
});

describe('each pair: broken gives its code and no other error, fixed gives nothing (criteria 5 and 6)', () => {
  for (const code of listed) {
    it(code, { timeout: 120_000 }, () => {
      const pair = pairOf(code);
      if (typeof pair === 'string') expect.fail(pair);

      const broken = check(project(pair.broken));
      expect(
        broken.some((f) => f.code === code),
        `${code}: the broken ${pair.file} does not give ${code}; it gives ${JSON.stringify(print(broken))}`,
      ).toBe(true);
      expect(
        print(broken.filter((f) => f.code !== code && f.severity === 'error')),
        `${code}: the broken ${pair.file} gives other errors`,
      ).toEqual([]);

      const fixed = check(project(pair.fixed));
      expect(print(fixed), `${code}: the fixed ${pair.file} is not clean`).toEqual([]);
    });
  }
});
