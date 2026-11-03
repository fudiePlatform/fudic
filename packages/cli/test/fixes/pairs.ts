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
 * `<`, `@` or `{` that is not a shell command (`pnpm add <pkg>` is no file of the language), and
 * the code of a language pass (`PASSES`, `PASS_FILES`) uses its function — a name in a comment
 * emits nothing. Both read from the disk, so a new code joins the list on its own; a code
 * that only the CLI, `fudic.json`, the bench or the plugin's own checks give is reviewed by hand.
 *
 * A pair is `fixtures/FUDnnnn.<ext>` + `fixtures/FUDnnnn.fixed.<ext>`, copied into `src/` of a
 * project of its own; or a folder `fixtures/FUDnnnn/`, copied as it is to the root of the
 * project, holding support files and at least one `<name>.fixed.<ext>`: beside its `<name>.<ext>`
 * it replaces that file in the fixed run; alone, it is a file the fix creates.
 * The fixed file is checked under the broken one's name: file names and tags matter. A project
 * without a `fudic.json` or a `tsconfig.json` gets the defaults below.
 *
 * The passes are the build's: `fudic.json` and its style chains read as the plugin reads them,
 * `transformFud` over every `.fud` with those chains and an asset registry (the emit set), the
 * project checker of `@fudic/typecheck` (the typed set), `ApiProject` for the `.fudapi`, and
 * `parseSpec` + `validateSpec` for the `.fudspec`.
 *
 * The codes are split over `fixes-<n>.test.ts` by their number, so vitest checks them in
 * parallel and a code always lands in the same file. Run one with `vitest run test/fixes -t FUDnnnn`.
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
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FUD0852 } from '@fudic/diagnostics';
import { explain } from '@fudic/diagnostics/explain';
import { createTermCatalog, parseSpec, readFixtures, validateSpec, type SpecContext, type SpecFs } from '@fudic/spec';
import { nodePackageFs } from '@fudic/resolve';
import { createProjectChecker, parseFud, tagOf } from '@fudic/typecheck';
import { LinkedAssets, nodeIo, ProjectStyleChains, transformFud } from '@fudic/vite';
import { ApiProject, nodeConfigIo, readProject } from '@fudic/vite/harness';
import { afterAll, describe, expect, it } from 'vitest';

const posix = (path: string): string => path.replace(/\\/gu, '/');
const at = (path: string): string => posix(fileURLToPath(new URL(path, import.meta.url))).replace(/\/$/u, '');

const PACKAGES = at('../../../');
const CODES = `${PACKAGES}/diagnostics/src/codes`;
const FIXTURES = `${PACKAGES}/diagnostics/fixtures`;
/** The framework's terms, as a project that installed `@fudic/terms` reads them. */
const FRAMEWORK_TERMS = `${PACKAGES}/terms/terms`;
/**
 * So that a fixture's `import` of a package resolves as it does in an app of this repository: the
 * CLI carries the runtime packages `examples/basic` depends on as dev-dependencies for this.
 */
const NODE_MODULES = `${PACKAGES}/cli/node_modules`;

/** The packages whose source gives a code from a `.fud`, a `.fudspec` or a `.fudapi`. */
const PASSES = ['compiler', 'language-core', 'resolve', 'typecheck', 'spec', 'api'] as const;
/**
 * And the one module of the plugin that runs inside `transformFud`, the emit set: what a file
 * adopts of the project's styles (`FUD0744`). The rest of `plugin.ts` is the build's own checks.
 */
const PASS_FILES = ['vite/src/transform.ts'] as const;

const EXTENSIONS = ['fud', 'fudspec', 'fudapi'] as const;
/** `<name>.fixed.<ext>` in a folder pair, of any extension: a fix may create a `.fixture.ts`. */
const FIXED_ANY = /^(.*)\.fixed(\.[^./]+)$/u;

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

/** A fragment that is typed in a terminal, not written in a file. */
const SHELL = /^(?:pnpm|npm|npx|yarn|fudic) /u;

/** The codes whose `**Fix:**` shows code: a backtick fragment with `<`, `@` or `{`, not a command. */
function withExample(): string[] {
  return readdirSync(CODES)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.slice(0, -'.md'.length))
    .filter((code) =>
      [...(explain(code)?.fix ?? '').matchAll(/`([^`]*)`/gu)].some((m) => /[<@{]/u.test(m[1]!) && !SHELL.test(m[1]!)),
    )
    .sort();
}

/**
 * A source without its comments: a code a comment names — `FUD0803` is the build saying so — is
 * not one the module emits. A `//` after a `:` is a URL, not a comment.
 */
const uncommented = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/(^|[^:])\/\/.*$/gmu, '$1');

/** The code of the language passes, read once. */
const passSource = [
  ...PASSES.flatMap((pkg) => walk(`${PACKAGES}/${pkg}/src`)),
  ...PASS_FILES.map((file) => `${PACKAGES}/${file}`),
]
  .filter((f) => f.endsWith('.ts'))
  .map((f) => uncommented(readFileSync(f, 'utf8')))
  .join('\n');

/**
 * The codes a pair checks: an example in the Fix, and the code's function used by a pass — called,
 * or picked as a value (`const unquoted = jsx ? FUD1161 : FUD0056`).
 */
export const listed = withExample().filter((code) => new RegExp(`\\b${code}\\b`, 'u').test(passSource));

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
    // Each `<name>.fixed.<ext>` replaces its `<name>.<ext>` in the fixed run, or — with no twin —
    // is a file the fix creates: absent from the broken run, added to the fixed one.
    const fixed = new Map(files.filter((f) => FIXED_ANY.test(f)).map((f) => [f.replace(FIXED_ANY, '$1$2'), f] as const));
    if (fixed.size === 0) return `${code}: fixtures/${code}/ holds no *.fixed.<ext>`;
    const changed = [...fixed.keys()].filter((f) => files.includes(f));
    const created = [...fixed.keys()].filter((f) => !files.includes(f));
    const fixedFiles = new Set(fixed.values());
    const broken = files.filter((f) => !fixedFiles.has(f));
    const kept = broken.filter((f) => !fixed.has(f));
    return {
      file: [...changed, ...created.map((f) => `${f} (created)`)].join(', '),
      broken: new Map(broken.map((f) => [f, `${folder}/${f}`] as const)),
      fixed: new Map([
        ...kept.map((f) => [f, `${folder}/${f}`] as const),
        ...[...fixed].map(([f, from]) => [f, `${folder}/${from}`] as const),
      ]),
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

  // The project as the plugin reads it: `fudic.json`, and its style chains with what they say.
  const config = readProject(root, false, nodeConfigIo());
  const styles = new ProjectStyleChains(root, nodePackageFs());
  const own = styles.own(root);
  for (const d of [...config.errors, ...own.errors, ...own.warnings]) {
    add(posix(resolve(root, d.file)), { ...d, span: d.span ?? { start: 0 } });
  }
  // The registry the plugin hands every emit: what a `.fud` links, `public/` and the page sheets.
  const assets = new LinkedAssets('/', `${root}/public`, 'assets', config.config?.css === 'link');

  // The `.fudapi`: parsed and validated, and their declarations written, as the build does.
  const api = new ApiProject(root);
  for (const { file, diagnostics } of api.diagnostics()) for (const d of diagnostics) add(file, d);
  api.writeDeclarations();

  // The emit set of every `.fud`.
  const io = nodeIo((path) => api.linked(path));
  for (const file of files.filter((f) => f.endsWith('.fud'))) {
    for (const d of transformFud(file, io, undefined, styles, assets)?.diagnostics ?? []) add(file, d);
  }
  // Once every page is compiled, what each sheet says about itself and the sheets no page keeps
  // a rule of — the plugin's last word on the CSS, said once per sheet.
  for (const [sheet, diagnostics] of assets.sheetDiagnostics()) {
    for (const d of diagnostics) add(posix(resolve(root, d.file ?? sheet)), { ...d, span: d.span ?? { start: 0 } });
  }
  for (const { name, site } of assets.unusedSheets()) {
    const unused = site === undefined ? FUD0852({ file: 'fudic.json', sheet: name }) : FUD0852({ ...site, sheet: name });
    add(posix(resolve(root, unused.file)), { ...unused, span: unused.span ?? { start: 0 } });
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

/** Every entry of `fixtures/`: a pair's file or folder. */
export const fixtureEntries = (): readonly string[] => (existsSync(FIXTURES) ? readdirSync(FIXTURES) : []);

/** How many `fixes-<n>.test.ts` share the pairs. */
export const SHARDS = 4;

/** The pairs of shard `shard`: the codes whose number leaves that remainder. */
export function pairTests(shard: number): void {
  afterAll(() => {
    for (const root of projects) rmSync(root, { recursive: true, force: true });
  });
  describe('each pair: broken gives its code and no other error, fixed gives nothing (criteria 5 and 6)', () => {
    for (const code of listed.filter((c) => Number(c.slice(3)) % SHARDS === shard)) pairTest(code);
  });
}

/** One code's pair, checked. */
function pairTest(code: string): void {
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
