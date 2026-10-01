/**
 * SDD-35 §6 — what the editor marks, the build fails on.
 *
 * Real `vite build`s over projects written to a temp folder: the typecheck runs in `buildStart`,
 * before anything is compiled, and the only way to know it does is a build that would otherwise
 * be green. Criterion 1 was meant to be seen red before the check existed; the check landed in
 * the same branch first, so this suite starts from the green side (SDD-35 Task, task 1).
 */

import { describe, it, expect } from 'vitest';
import { build, createLogger, type Logger } from 'vite';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fudic } from '../src/index.js';
import { runtimeAlias } from './helpers/alias.js';

const TSCONFIG = JSON.stringify({
  compilerOptions: {
    target: 'ES2024',
    module: 'ESNext',
    moduleResolution: 'bundler',
    lib: ['ES2024', 'DOM', 'DOM.Iterable'],
    strict: true,
    skipLibCheck: true,
    noEmit: true,
  },
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

const NAV = `@code {
  const { current = '' } = props<{ current?: string }>();
}

<site-nav>
  <template shadowrootmode="open">
    <nav class:active="@(current === 'home')"></nav>
  </template>
</site-nav>
`;

/** A page that uses the badge with `tone` set to whatever `tone` is: line 8, `tone` at column 17. */
const page = (tone: string, extra = ''): string => `<!DOCTYPE html>
<html>
  <head>
    <link rel="component" href="../components/app-badge.fud">
    <title>Test</title>
  </head>
  <body>
    <app-badge .tone="@(${tone})">hi</app-badge>
${extra}  </body>
</html>
`;

/** A page around `body`, linking `components`. */
const doc = (components: readonly string[], body: string): string => `<!DOCTYPE html>
<html>
  <head>
${components.map((name) => `    <link rel="component" href="../components/${name}.fud">\n`).join('')}    <title>Test</title>
  </head>
  <body>
${body}  </body>
</html>
`;

type Files = Readonly<Record<string, string>>;

/** What one build said: whether it threw, its error message, and every line it logged. */
interface Outcome {
  readonly failed: boolean;
  readonly message: string;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly root: string;
}

function writeProject(files: Files, tsconfig = true): string {
  const root = mkdtempSync(join(tmpdir(), 'fudic-typecheck-'));
  const all: Files = tsconfig ? { 'tsconfig.json': TSCONFIG, ...files } : files;
  for (const [relative, text] of Object.entries(all)) {
    const file = join(root, relative);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  return root;
}

/** A logger that keeps what the build says instead of printing it. */
function capture(): { logger: Logger; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const logger = createLogger('silent');
  logger.error = (message) => {
    errors.push(message);
  };
  logger.warn = (message) => {
    warnings.push(message);
  };
  logger.warnOnce = logger.warn;
  return { logger, errors, warnings };
}

async function buildProject(files: Files, options: { tsconfig?: boolean } = {}): Promise<Outcome> {
  const root = writeProject(files, options.tsconfig ?? true);
  const { logger, errors, warnings } = capture();
  try {
    await build({
      root,
      logLevel: 'silent',
      customLogger: logger,
      resolve: { alias: { ...runtimeAlias } },
      plugins: [fudic()],
      build: { minify: false },
    });
    return { failed: false, message: '', errors, warnings, root };
  } catch (error) {
    return { failed: true, message: (error as Error).message, errors, warnings, root };
  }
}

/** The blocks the typecheck printed: one per problem, each starting with its position. */
const problemsOf = (outcome: Outcome): string[] => outcome.errors.filter((line) => / - error /u.test(line));

const BASE: Files = {
  'src/components/app-badge.fud': BADGE,
  'src/routes/index.fud': page(`'info'`),
};

describe('SDD-35 §6.1–§6.2 — the gap, closed', () => {
  it('a value outside the union fails the build with one TS2322 on `tone`', async () => {
    const outcome = await buildProject({ ...BASE, 'src/routes/index.fud': page('42') });

    expect(outcome.failed).toBe(true);
    expect(outcome.message).toContain('1 error in 1 file');
    const [problem, ...rest] = problemsOf(outcome);
    expect(rest).toEqual([]);
    // Relative path, 1-based line and column, and the frame underlining the four letters of
    // `tone`.
    expect(problem).toMatch(/^src\/routes\/index.fud:8:17 - error TS2322: /u);
    expect(problem).toContain('<app-badge .tone="@(42)">hi</app-badge>');
    expect(problem).toContain('────');
    // Nothing was written.
    expect(existsSync(join(outcome.root, 'dist'))).toBe(false);
  }, 120_000);

  it('the same project with a valid value builds', async () => {
    const outcome = await buildProject(BASE);
    expect(outcome.message).toBe('');
    expect(outcome.failed).toBe(false);
    expect(problemsOf(outcome)).toEqual([]);
  }, 120_000);
});

describe('SDD-35 §6 — the build', () => {
  it('6 — two files with one error each: both printed, one failure', async () => {
    const outcome = await buildProject({
      ...BASE,
      'src/routes/index.fud': page('42'),
      'src/routes/about.fud': page(`'bogus'`),
    });
    expect(outcome.failed).toBe(true);
    expect(outcome.message).toContain('2 errors in 2 files');
    const problems = problemsOf(outcome);
    expect(problems).toHaveLength(2);
    // §4.6: sorted by relative path.
    expect(problems[0]).toMatch(/^src\/routes\/about\.fud:/u);
    expect(problems[1]).toMatch(/^src\/routes\/index\.fud:/u);
  }, 120_000);

  it('7 — a component no route reaches still breaks the build', async () => {
    const outcome = await buildProject({
      ...BASE,
      'src/components/orphan-thing.fud': `@code {
  const n: number = 'not a number';
}

<orphan-thing>
  <template shadowrootmode="open"><p>@n</p></template>
</orphan-thing>
`,
    });
    expect(outcome.failed).toBe(true);
    expect(problemsOf(outcome)[0]).toMatch(/^src\/components\/orphan-thing\.fud:2:\d+ - error TS2322/u);
  }, 120_000);

  it('8 — changing `type Tone` breaks every consumer', async () => {
    const outcome = await buildProject({
      'src/components/app-badge.fud': BADGE.replace(`'neutral' | 'success' | 'info'`, `'neutral' | 'success'`),
      'src/routes/index.fud': page(`'info'`),
      'src/routes/about.fud': page(`'info'`),
    });
    expect(outcome.failed).toBe(true);
    // The badge's own `tone === 'info'` is now a comparison with no overlap, and says so too;
    // what this criterion is about is the consumers.
    const problems = problemsOf(outcome).filter((line) => line.startsWith('src/routes/'));
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(/^src\/routes\/about.fud:8:17 - error TS2322/u);
    expect(problems[1]).toMatch(/^src\/routes\/index.fud:8:17 - error TS2322/u);
  }, 120_000);

  it('9 — a component without @code, and one with an empty @code, report nothing', async () => {
    const outcome = await buildProject({
      'src/components/no-code.fud': `<no-code>
  <template shadowrootmode="open"><p>hi</p></template>
</no-code>
`,
      'src/components/empty-code.fud': `@code {
}

<empty-code>
  <template shadowrootmode="open"><p>hi</p></template>
</empty-code>
`,
      'src/routes/index.fud': doc(['no-code', 'empty-code'], '    <no-code></no-code>\n    <empty-code></empty-code>\n'),
    });
    expect(problemsOf(outcome)).toEqual([]);
    expect(outcome.failed).toBe(false);
  }, 120_000);

  it('10 — a stale fudic-globals.d.ts on disk: no TS2300, GLOBALS_DTS wins', async () => {
    const outcome = await buildProject({
      ...BASE,
      // An old copy that declares `props` with a different shape: if it voted, `props<…>()`
      // would be a duplicate or the wrong signature.
      'src/fudic-globals.d.ts': 'declare function props(): string;\n',
    });
    expect(outcome.errors.join('\n')).not.toContain('TS2300');
    expect(problemsOf(outcome)).toEqual([]);
    expect(outcome.failed).toBe(false);
  }, 120_000);

  it('11 — without a tsconfig.json: FUD0870 as a warning, and the build ends', async () => {
    const outcome = await buildProject(BASE, { tsconfig: false });
    expect(outcome.warnings.join('\n')).toContain('FUD0870');
    expect(outcome.failed).toBe(false);
  }, 120_000);

  it('12 — a library .fud with a type error does not break the project that uses it', async () => {
    const outcome = await buildProject({
      // The page USES the library's component: had the library not been found, the link would
      // not resolve and the build would fail for that instead.
      'src/routes/index.fud': `<!DOCTYPE html>
<html>
  <head>
    <link rel="component" href="@acme/ui/acme-card.fud">
    <title>Test</title>
  </head>
  <body>
    <acme-card></acme-card>
  </body>
</html>
`,
      'node_modules/@acme/ui/package.json': JSON.stringify({ name: '@acme/ui', version: '1.0.0', type: 'module' }),
      'node_modules/@acme/ui/fudic.json': JSON.stringify({ kind: 'lib', prefix: 'acme' }),
      'node_modules/@acme/ui/acme-card.fud': `@code {
  const n: number = 'broken';
}

<acme-card>
  <template shadowrootmode="open"><p>@n</p></template>
</acme-card>
`,
      'package.json': JSON.stringify({
        name: 'app',
        private: true,
        type: 'module',
        dependencies: { '@acme/ui': '1.0.0' },
      }),
    });
    expect(problemsOf(outcome)).toEqual([]);
    expect(outcome.message).toBe('');
    expect(outcome.failed).toBe(false);
  }, 120_000);

  it('14 — `.currnt` gives TS2561 only, never FUD0198', async () => {
    const outcome = await buildProject({
      'src/components/site-nav.fud': NAV,
      'src/routes/index.fud': doc(['site-nav'], '    <site-nav .currnt="home"></site-nav>\n'),
    });
    expect(outcome.failed).toBe(true);
    const problems = problemsOf(outcome);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('error TS2561');
    expect(outcome.errors.join('\n')).not.toContain('FUD0198');
  }, 120_000);

  it('17 — two builds of the same broken tree print the same text, byte for byte', async () => {
    const files: Files = {
      ...BASE,
      'src/routes/index.fud': page('42', '<app-badge .tone="@(7)">x</app-badge>\n'),
      'src/routes/about.fud': page(`'bogus'`),
    };
    const first = await buildProject(files);
    const second = await buildProject(files);
    const strip = (outcome: Outcome): string => problemsOf(outcome).join('\n---\n');
    expect(problemsOf(first)).toHaveLength(3);
    expect(strip(first)).toBe(strip(second));
    expect(first.message).toBe(second.message);
  }, 240_000);
});
